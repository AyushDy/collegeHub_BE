/**
 * Quiz Socket Handler
 *
 * ─── Lifecycle ───────────────────────────────────────────────────────────────
 *
 *  1. Creator calls  POST /api/quiz/:quizId/start  (REST)
 *       → DB status → RUNNING
 *       → startQuizSession() called server-side
 *       → quiz:announced  emitted to the GROUP room
 *       → Lobby is now open; participants can emit quiz:join
 *
 *  2. Participants emit  quiz:join  { quizId }
 *       → Added to in-memory session
 *       → quiz:joined  acked to the joining socket
 *       → quiz:participant-joined  broadcast to quiz room (lobby update)
 *
 *  3. Creator (or faculty/admin) emits  quiz:lock  { quizId }
 *       → No more joins accepted
 *       → quiz:locked  broadcast to quiz room with final participant list
 *       → Question sequence begins immediately
 *
 *  4. Per question:
 *       → quiz:question  emitted (no correctIndex)
 *       → Participants emit  quiz:answer
 *       → quiz:answer-ack  to answering socket
 *       → quiz:score-update  to quiz room on every accepted answer
 *       → When timer expires OR all answered → quiz:question-result emitted
 *       → 3 s pause → next question
 *
 *  5. After last question:
 *       → quiz:ended  emitted with leaderboard
 *       → DB persisted (status ENDED, stats, participants)
 *
 * ─── Client → Server events ──────────────────────────────────────────────────
 *   quiz:join         { quizId }
 *   quiz:lock         { quizId }                    — creator / faculty / admin
 *   quiz:answer       { quizId, questionIndex, selectedIndex }
 *
 * ─── Server → Client events ──────────────────────────────────────────────────
 *   quiz:announced        { quizId, title, groupId, questionCount }
 *                         → group room when REST /start is called
 *   quiz:joined           { quizId, participantCount }
 *                         → ack to joining socket
 *   quiz:participant-joined { quizId, userId, participantCount }
 *                         → quiz room — lobby live update
 *   quiz:locked           { quizId, participantCount, participants[] }
 *                         → quiz room — lobby closed, questions about to start
 *   quiz:question         { quizId, questionIndex, totalQuestions, text, options[], timeLimitSeconds }
 *                         → quiz room (correctIndex NOT included)
 *   quiz:answer-ack       { quizId, questionIndex }
 *                         → answering socket
 *   quiz:score-update     { quizId, userId, score, totalResponseTimeMs }
 *                         → quiz room
 *   quiz:question-result  { quizId, questionIndex, correctIndex, optionCounts[], correctCount }
 *                         → quiz room after question closes
 *   quiz:ended            { quizId, leaderboard[] }
 *                         → quiz room
 *   quiz:error            { message }
 *                         → requesting socket only
 */

const Quiz = require("../models/Quiz");
const { isMember } = require("../utils/groupMembership");

const BETWEEN_QUESTIONS_MS = 3_000; // pause between question-result and next question

/**
 * In-memory map of active quiz sessions.
 * Key: quizId (string) — Value: QuizSession
 */
const activeSessions = new Map();

class QuizSession {
  constructor(quiz) {
    this.quiz = quiz;
    this.quizId = quiz._id.toString();
    /** Map<userId, { userId, score, totalResponseTimeMs, answers: Map<qIdx, answer> }> */
    this.participants = new Map();
    this.currentQuestionIndex = -1;
    this.questionStartedAt = 0;
    this.questionTimer = null;
    this.questionClosed = false; // guard against double closeQuestion calls
    this.locked = false;         // true once quiz:lock is received — no new joins
    this.started = false;        // true once first question is emitted
    this.questionStats = {};
    this.creatorId = quiz.createdBy.toString();
  }

  addParticipant(userId) {
    if (!this.participants.has(userId)) {
      this.participants.set(userId, {
        userId,
        score: 0,
        totalResponseTimeMs: 0,
        answers: new Map(),
      });
      return true; // newly added
    }
    return false; // already present
  }

  recordAnswer(userId, questionIndex, selectedIndex, responseTimeMs) {
    const participant = this.participants.get(userId);
    if (!participant) return false; // not in session
    if (participant.answers.has(questionIndex)) return false; // already answered

    const q = this.quiz.questions[questionIndex];
    if (!q) return false;

    const isCorrect = selectedIndex === q.correctIndex;
    participant.answers.set(questionIndex, { selectedIndex, isCorrect, responseTimeMs });
    if (isCorrect) {
      participant.score += 1;
      participant.totalResponseTimeMs += responseTimeMs;
    }
    return { isCorrect, correctIndex: q.correctIndex };
  }

  isQuestionAnsweredByAll(questionIndex) {
    if (this.participants.size === 0) return false;
    for (const [, p] of this.participants) {
      if (!p.answers.has(questionIndex)) return false;
    }
    return true;
  }
}

/**
 * Main export — called once from socket/index.js.
 */
module.exports = (io) => {

  // ─── Per-socket event registration ────────────────────────────────────────
  const registerHandlers = (socket) => {

    // ── quiz:join ───────────────────────────────────────────────────────────
    socket.on("quiz:join", async ({ quizId } = {}) => {
      try {
        if (!quizId)
          return socket.emit("quiz:error", { message: "quizId is required." });

        const quiz = await Quiz.findById(quizId);
        if (!quiz)
          return socket.emit("quiz:error", { message: "Quiz not found." });
        if (quiz.status === "ENDED")
          return socket.emit("quiz:error", { message: "Quiz has already ended." });
        if (quiz.status === "CREATED")
          return socket.emit("quiz:error", { message: "Quiz has not started yet. Wait for the host to open the lobby." });

        // Validate group membership
        const member = await isMember(
          socket.user.userId,
          socket.user.role,
          quiz.groupId.toString()
        );
        if (!member)
          return socket.emit("quiz:error", { message: "You are not a member of this group." });

        const session = activeSessions.get(quizId);

        // Lobby is locked — late join rejected
        if (session && session.locked)
          return socket.emit("quiz:error", { message: "Lobby is locked. The quiz has already begun." });

        socket.join(`quiz:${quizId}`);

        if (session) {
          const isNew = session.addParticipant(socket.user.userId);
          const participantCount = session.participants.size;

          socket.emit("quiz:joined", { quizId, participantCount });

          // Broadcast to quiz room so lobby updates for everyone (including creator)
          if (isNew) {
            io.to(`quiz:${quizId}`).emit("quiz:participant-joined", {
              quizId,
              userId: socket.user.userId,
              participantCount,
            });
          }
        } else {
          // Session not in memory (edge: server restart between REST start and socket join)
          socket.emit("quiz:joined", { quizId, participantCount: 0 });
        }
      } catch (err) {
        socket.emit("quiz:error", { message: err.message });
      }
    });

    // ── quiz:lock ───────────────────────────────────────────────────────────
    // Sent by the quiz creator (or faculty/admin) to close the lobby and begin questions.
    socket.on("quiz:lock", async ({ quizId } = {}) => {
      try {
        if (!quizId)
          return socket.emit("quiz:error", { message: "quizId is required." });

        const session = activeSessions.get(quizId);
        if (!session)
          return socket.emit("quiz:error", { message: "No active lobby found for this quiz." });

        if (session.locked)
          return socket.emit("quiz:error", { message: "Quiz is already locked and running." });

        // Only the quiz creator, FACULTY, or ADMIN may lock
        const isCreator = socket.user.userId === session.creatorId;
        const isModerator = socket.user.role === "FACULTY" || socket.user.role === "ADMIN";
        if (!isCreator && !isModerator)
          return socket.emit("quiz:error", { message: "Only the quiz creator, faculty, or admin can lock the quiz." });

        session.locked = true;

        const participants = [...session.participants.keys()];

        // Notify everyone: lobby closed, questions starting
        io.to(`quiz:${quizId}`).emit("quiz:locked", {
          quizId,
          participantCount: participants.length,
          participants,
        });

        // Start question sequence immediately
        emitQuestion(io, session, 0);
      } catch (err) {
        socket.emit("quiz:error", { message: err.message });
      }
    });

    // ── quiz:answer ─────────────────────────────────────────────────────────
    socket.on("quiz:answer", ({ quizId, questionIndex, selectedIndex } = {}) => {
      try {
        if (
          !quizId ||
          questionIndex === undefined ||
          questionIndex === null ||
          selectedIndex === undefined ||
          selectedIndex === null
        )
          return socket.emit("quiz:error", {
            message: "quizId, questionIndex, and selectedIndex are required.",
          });

        const session = activeSessions.get(quizId);
        if (!session)
          return socket.emit("quiz:error", { message: "No active quiz session found." });

        if (!session.started)
          return socket.emit("quiz:error", { message: "Questions have not started yet." });

        if (session.currentQuestionIndex !== questionIndex)
          return socket.emit("quiz:error", {
            message: "Wrong question index — this question is not active.",
          });

        if (!session.participants.has(socket.user.userId))
          return socket.emit("quiz:error", { message: "You have not joined this quiz." });

        if (session.questionClosed)
          return socket.emit("quiz:error", { message: "Time is up for this question." });

        // selectedIndex must be a valid option index (0-based)
        const totalOptions = session.quiz.questions[session.currentQuestionIndex]?.options?.length ?? 0;
        if (
          !Number.isInteger(selectedIndex) ||
          selectedIndex < 0 ||
          selectedIndex >= totalOptions
        )
          return socket.emit("quiz:error", {
            message: `selectedIndex must be between 0 and ${totalOptions - 1}.`,
          });

        const responseTimeMs = Date.now() - session.questionStartedAt;
        const result = session.recordAnswer(
          socket.user.userId,
          questionIndex,
          selectedIndex,
          responseTimeMs
        );

        if (result === false) {
          return socket.emit("quiz:error", { message: "You have already answered this question." });
        }

        socket.emit("quiz:answer-ack", { quizId, questionIndex });

        // Live score broadcast
        const participant = session.participants.get(socket.user.userId);
        io.to(`quiz:${quizId}`).emit("quiz:score-update", {
          quizId,
          userId: socket.user.userId,
          score: participant.score,
          totalResponseTimeMs: participant.totalResponseTimeMs,
        });

        // Early close — all participants answered
        if (session.isQuestionAnsweredByAll(questionIndex) && !session.questionClosed) {
          clearTimeout(session.questionTimer);
          session.questionTimer = null;
          closeQuestion(io, session);
        }
      } catch (err) {
        socket.emit("quiz:error", { message: err.message });
      }
    });
  };

  // ─── Called from REST /api/quiz/:quizId/start ──────────────────────────────
  // Opens the lobby — questions do NOT start until creator emits quiz:lock.
  const startQuizSession = (quiz) => {
    const quizId = quiz._id.toString();
    if (activeSessions.has(quizId)) return; // guard against duplicate calls

    const session = new QuizSession(quiz);
    activeSessions.set(quizId, session);

    // Announce to the GROUP room — clients should emit quiz:join to enter the lobby
    io.to(quiz.groupId.toString()).emit("quiz:announced", {
      quizId,
      title: quiz.title,
      groupId: quiz.groupId.toString(),
      questionCount: quiz.questions.length,
      // Lobby stays open until the creator emits quiz:lock
    });
  };

  return { registerHandlers, startQuizSession };
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

function emitQuestion(io, session, questionIndex) {
  const quiz = session.quiz;

  if (questionIndex >= quiz.questions.length) {
    return endQuiz(io, session);
  }

  const q = quiz.questions[questionIndex];
  session.currentQuestionIndex = questionIndex;
  session.questionStartedAt = Date.now();
  session.questionClosed = false;
  session.started = true;

  io.to(`quiz:${session.quizId}`).emit("quiz:question", {
    quizId: session.quizId,
    questionIndex,
    totalQuestions: quiz.questions.length,
    text: q.text,
    options: q.options,
    timeLimitSeconds: q.timeLimit,
  });

  // Schedule auto-close after timeLimit
  session.questionTimer = setTimeout(() => {
    session.questionTimer = null;
    if (!session.questionClosed) {
      closeQuestion(io, session);
    }
  }, q.timeLimit * 1000);
}

function closeQuestion(io, session) {
  // Guard — only close once per question
  if (session.questionClosed) return;
  session.questionClosed = true;

  const questionIndex = session.currentQuestionIndex;
  const q = session.quiz.questions[questionIndex];

  // Compute per-option selection counts
  const optionCounts = new Array(q.options.length).fill(0);
  let correctCount = 0;

  for (const [, p] of session.participants) {
    const ans = p.answers.get(questionIndex);
    if (ans && ans.selectedIndex >= 0 && ans.selectedIndex < q.options.length) {
      optionCounts[ans.selectedIndex]++;
      if (ans.isCorrect) correctCount++;
    }
  }

  session.questionStats[questionIndex] = { optionCounts, correctCount };

  io.to(`quiz:${session.quizId}`).emit("quiz:question-result", {
    quizId: session.quizId,
    questionIndex,
    correctIndex: q.correctIndex,
    optionCounts,
    correctCount,
  });

  // Pause then move to next question
  setTimeout(() => {
    emitQuestion(io, session, questionIndex + 1);
  }, BETWEEN_QUESTIONS_MS);
}

async function endQuiz(io, session) {
  try {
    const ranked = [...session.participants.values()]
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.totalResponseTimeMs - b.totalResponseTimeMs;
      })
      .map((p, idx) => ({
        rank: idx + 1,
        userId: p.userId,
        score: p.score,
        totalResponseTimeMs: p.totalResponseTimeMs,
      }));

    // Persist to DB
    const quiz = await Quiz.findById(session.quizId);
    if (quiz) {
      quiz.status = "ENDED";
      quiz.endedAt = new Date();

      quiz.questions.forEach((q, idx) => {
        const stats = session.questionStats[idx];
        if (stats) {
          q.stats = {
            optionCounts: stats.optionCounts,
            correctCount: stats.correctCount,
          };
        }
      });

      quiz.participants = [...session.participants.values()].map((p) => ({
        userId: p.userId,
        score: p.score,
        totalResponseTimeMs: p.totalResponseTimeMs,
        answers: [...p.answers.entries()].map(([qIdx, ans]) => ({
          questionIndex: qIdx,
          selectedIndex: ans.selectedIndex,
          isCorrect: ans.isCorrect,
          responseTimeMs: ans.responseTimeMs,
        })),
      }));

      await quiz.save();
    }

    io.to(`quiz:${session.quizId}`).emit("quiz:ended", {
      quizId: session.quizId,
      leaderboard: ranked,
    });

    activeSessions.delete(session.quizId);
  } catch (err) {
    console.error(`[quiz:endQuiz] Error ending quiz ${session.quizId}:`, err.message);
  }
}
