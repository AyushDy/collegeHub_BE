/**
 * Quiz Socket Handler
 *
 * Manages real-time quiz sessions driven by Socket.IO.
 *
 * Quiz room name: `quiz:<quizId>`
 *
 * Client → Server events:
 *   quiz:join    { quizId }                         — join a running quiz
 *   quiz:answer  { quizId, questionIndex, selectedIndex }
 *
 * Server → Client events:
 *   quiz:announced      { quizId, title, groupId, joinWindowMs, questionCount }
 *                       → broadcast to group room when quiz is started via REST
 *   quiz:joined         { quizId, participantCount }
 *                       → ack to the joining socket
 *   quiz:question       { quizId, questionIndex, totalQuestions, text, options, timeLimitSeconds }
 *                       → broadcast to quiz room (correctIndex NOT included)
 *   quiz:answer-ack     { quizId, questionIndex }
 *                       → ack to answering socket
 *   quiz:question-result { quizId, questionIndex, correctIndex, optionCounts, correctCount }
 *                       → broadcast to quiz room after timeout
 *   quiz:score-update   { quizId, userId, score, totalResponseTimeMs }
 *                       → broadcast to quiz room so clients can show live scores
 *   quiz:ended          { quizId, leaderboard }
 *                       → broadcast to quiz room
 *   quiz:error          { message }
 *                       → to the requesting socket only
 */

const Quiz = require("../models/Quiz");
const { isMember } = require("../utils/groupMembership");

const JOIN_WINDOW_MS = 10_000; // 10 s window for participants to join after quiz:announced
const BETWEEN_QUESTIONS_MS = 3_000; // 3 s pause between question result and next question

/**
 * In-memory map of active quiz sessions.
 * Key: quizId (string)
 * Value: QuizSession (see below)
 */
const activeSessions = new Map();

class QuizSession {
  constructor(quiz) {
    this.quiz = quiz; // Mongoose document (re-fetched from DB as needed)
    this.quizId = quiz._id.toString();
    /** Map<userId string, { score, totalResponseTimeMs, answers: Map<qIdx, answer> }> */
    this.participants = new Map();
    this.currentQuestionIndex = -1;
    this.questionTimer = null;
    this.started = false;
  }

  addParticipant(userId) {
    if (!this.participants.has(userId)) {
      this.participants.set(userId, {
        userId,
        score: 0,
        totalResponseTimeMs: 0,
        answers: new Map(), // questionIndex → { selectedIndex, isCorrect, responseTimeMs }
      });
    }
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
    for (const [, p] of this.participants) {
      if (!p.answers.has(questionIndex)) return false;
    }
    return this.participants.size > 0;
  }
}

/**
 * Main export — called in socket/index.js to register handlers per socket.
 * Also sets up the `io` reference used by `startQuizSession`.
 */
module.exports = (io) => {
  // ─── Per-socket event registration ────────────────────────────────────────
  const registerHandlers = (socket) => {
    // ── quiz:join ───────────────────────────────────────────────────────────
    socket.on("quiz:join", async ({ quizId } = {}) => {
      try {
        if (!quizId)
          return socket.emit("quiz:error", { message: "quizId is required." });

        // Load quiz
        const quiz = await Quiz.findById(quizId);
        if (!quiz) return socket.emit("quiz:error", { message: "Quiz not found." });
        if (quiz.status === "ENDED")
          return socket.emit("quiz:error", { message: "Quiz has already ended." });
        if (quiz.status === "CREATED")
          return socket.emit("quiz:error", { message: "Quiz has not started yet." });

        // Validate group membership
        const member = await isMember(
          socket.user.userId,
          socket.user.role,
          quiz.groupId.toString()
        );
        if (!member)
          return socket.emit("quiz:error", {
            message: "You are not a member of this group.",
          });

        const roomName = `quiz:${quizId}`;
        socket.join(roomName);

        // Register in session if it exists
        const session = activeSessions.get(quizId);
        if (session) {
          session.addParticipant(socket.user.userId);
        }

        const participantCount = session ? session.participants.size : 0;
        socket.emit("quiz:joined", { quizId, participantCount });
      } catch (err) {
        socket.emit("quiz:error", { message: err.message });
      }
    });

    // ── quiz:answer ─────────────────────────────────────────────────────────
    socket.on("quiz:answer", ({ quizId, questionIndex, selectedIndex } = {}) => {
      try {
        if (!quizId || questionIndex === undefined || selectedIndex === undefined)
          return socket.emit("quiz:error", {
            message: "quizId, questionIndex, and selectedIndex are required.",
          });

        const session = activeSessions.get(quizId);
        if (!session)
          return socket.emit("quiz:error", { message: "No active quiz session found." });

        if (session.currentQuestionIndex !== questionIndex)
          return socket.emit("quiz:error", {
            message: "Wrong question index — this question is not active.",
          });

        if (!session.participants.has(socket.user.userId))
          return socket.emit("quiz:error", {
            message: "You have not joined this quiz.",
          });

        const responseTimeMs = Date.now() - session.questionStartedAt;
        const result = session.recordAnswer(
          socket.user.userId,
          questionIndex,
          selectedIndex,
          responseTimeMs
        );

        if (result === false) {
          // Already answered
          return socket.emit("quiz:error", {
            message: "You have already answered this question.",
          });
        }

        socket.emit("quiz:answer-ack", { quizId, questionIndex });

        // Broadcast live score update
        const participant = session.participants.get(socket.user.userId);
        io.to(`quiz:${quizId}`).emit("quiz:score-update", {
          quizId,
          userId: socket.user.userId,
          score: participant.score,
          totalResponseTimeMs: participant.totalResponseTimeMs,
        });

        // Early close — everyone answered
        if (session.isQuestionAnsweredByAll(questionIndex)) {
          clearTimeout(session.questionTimer);
          session.questionTimer = null;
          closeQuestion(io, session);
        }
      } catch (err) {
        socket.emit("quiz:error", { message: err.message });
      }
    });
  };

  // ─── Called from REST controller after quiz is set to RUNNING ─────────────
  const startQuizSession = (quiz) => {
    const quizId = quiz._id.toString();

    if (activeSessions.has(quizId)) return; // guard against duplicate calls

    const session = new QuizSession(quiz);
    activeSessions.set(quizId, session);

    // Announce to the group room so members know to join
    io.to(quiz.groupId.toString()).emit("quiz:announced", {
      quizId,
      title: quiz.title,
      groupId: quiz.groupId.toString(),
      joinWindowMs: JOIN_WINDOW_MS,
      questionCount: quiz.questions.length,
    });

    // After JOIN_WINDOW, fire the first question
    setTimeout(() => {
      emitQuestion(io, session, 0);
    }, JOIN_WINDOW_MS);
  };

  return { registerHandlers, startQuizSession };
};

// ─── Internal helpers (module-level, not exported) ────────────────────────────

/**
 * Emit a question to the quiz room and set its timer.
 */
function emitQuestion(io, session, questionIndex) {
  const quiz = session.quiz;
  if (questionIndex >= quiz.questions.length) {
    return endQuiz(io, session);
  }

  const q = quiz.questions[questionIndex];
  session.currentQuestionIndex = questionIndex;
  session.questionStartedAt = Date.now();

  // Emit question WITHOUT correctIndex
  io.to(`quiz:${session.quizId}`).emit("quiz:question", {
    quizId: session.quizId,
    questionIndex,
    totalQuestions: quiz.questions.length,
    text: q.text,
    options: q.options,
    timeLimitSeconds: q.timeLimit,
  });

  // Schedule close after timeLimit
  session.questionTimer = setTimeout(() => {
    session.questionTimer = null;
    closeQuestion(io, session);
  }, q.timeLimit * 1000);
}

/**
 * Close the current question: compute stats, emit result, move to next.
 */
function closeQuestion(io, session) {
  const questionIndex = session.currentQuestionIndex;
  const q = session.quiz.questions[questionIndex];

  // Compute option counts
  const optionCounts = new Array(q.options.length).fill(0);
  let correctCount = 0;

  for (const [, p] of session.participants) {
    const ans = p.answers.get(questionIndex);
    if (ans && ans.selectedIndex >= 0 && ans.selectedIndex < q.options.length) {
      optionCounts[ans.selectedIndex]++;
      if (ans.isCorrect) correctCount++;
    }
  }

  // Persist stats in-memory on the quiz object (will be saved to DB at end)
  if (!session.questionStats) session.questionStats = {};
  session.questionStats[questionIndex] = { optionCounts, correctCount };

  // Broadcast result
  io.to(`quiz:${session.quizId}`).emit("quiz:question-result", {
    quizId: session.quizId,
    questionIndex,
    correctIndex: q.correctIndex,
    optionCounts,
    correctCount,
  });

  // Move to next question after a brief pause
  const nextIndex = questionIndex + 1;
  setTimeout(() => {
    emitQuestion(io, session, nextIndex);
  }, BETWEEN_QUESTIONS_MS);
}

/**
 * Finalise the quiz: build leaderboard, persist to DB, emit quiz:ended.
 */
async function endQuiz(io, session) {
  try {
    // Sort participants by score descending; tie-breaker: lower total response time
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

      // Persist per-question stats
      quiz.questions.forEach((q, idx) => {
        const stats = session.questionStats?.[idx];
        if (stats) {
          q.stats = {
            optionCounts: stats.optionCounts,
            correctCount: stats.correctCount,
          };
        }
      });

      // Persist participant results
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

    // Clean up in-memory session
    activeSessions.delete(session.quizId);
  } catch (err) {
    console.error(`[quiz:endQuiz] Error ending quiz ${session.quizId}:`, err.message);
  }
}
