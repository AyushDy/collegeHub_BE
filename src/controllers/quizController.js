const Quiz = require("../models/Quiz");
const Notification = require("../models/Notification");
const AcademicGroup = require("../models/AcademicGroup");
const GroupMembership = require("../models/GroupMembership");
const { isMember } = require("../utils/groupMembership");

// ─── Helper: fan-out quiz notifications to all group members ─────────────────
const createQuizNotifications = async (quiz) => {
  const memberships = await GroupMembership.find({ groupId: quiz.groupId }).lean();
  if (!memberships.length) return;

  const notifications = memberships.map((m) => ({
    targetUserId: m.userId,
    targetGroupId: quiz.groupId,
    type: "QUIZ",
    payload: {
      quizId: quiz._id,
      title: quiz.title,
      createdBy: quiz.createdBy,
    },
  }));

  await Notification.insertMany(notifications);
};

// ─── POST /api/quiz ───────────────────────────────────────────────────────────
// Create a quiz — any authenticated group member (student, faculty, admin)
exports.createQuiz = async (req, res) => {
  try {
    const { title, groupId, questions } = req.body;

    // Validate required fields
    if (!title || !title.trim())
      return res.status(400).json({ message: "title is required." });
    if (!groupId)
      return res.status(400).json({ message: "groupId is required." });
    if (!Array.isArray(questions) || questions.length === 0)
      return res.status(400).json({ message: "questions must be a non-empty array." });

    // Check group exists
    const group = await AcademicGroup.findById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found." });

    // Check creator is a member
    const member = await isMember(req.user.userId, req.user.role, groupId);
    if (!member)
      return res.status(403).json({ message: "You are not a member of this group." });

    // Validate questions
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.text || !q.text.trim())
        return res.status(400).json({ message: `Question ${i + 1}: text is required.` });
      if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6)
        return res
          .status(400)
          .json({ message: `Question ${i + 1}: options must be an array of 2–6 items.` });
      if (q.correctIndex === undefined || q.correctIndex === null)
        return res.status(400).json({ message: `Question ${i + 1}: correctIndex is required.` });
      if (
        !Number.isInteger(q.correctIndex) ||
        q.correctIndex < 0 ||
        q.correctIndex >= q.options.length
      )
        return res.status(400).json({
          message: `Question ${i + 1}: correctIndex must be a valid index into options.`,
        });
      if (q.timeLimit === undefined || q.timeLimit === null)
        return res.status(400).json({ message: `Question ${i + 1}: timeLimit is required.` });
      if (!Number.isInteger(q.timeLimit) || q.timeLimit < 5 || q.timeLimit > 600)
        return res.status(400).json({
          message: `Question ${i + 1}: timeLimit must be an integer between 5 and 600 seconds.`,
        });
    }

    const quiz = await Quiz.create({
      title: title.trim(),
      groupId,
      createdBy: req.user.userId,
      roleOfCreator: req.user.role,
      questions: questions.map((q) => ({
        text: q.text.trim(),
        options: q.options.map((o) => String(o).trim()),
        correctIndex: q.correctIndex,
        timeLimit: q.timeLimit,
      })),
    });

    // Fan-out notifications (non-blocking — don't fail the request if this errors)
    createQuizNotifications(quiz).catch((err) =>
      console.error("Notification fan-out error:", err.message)
    );

    res.status(201).json({ message: "Quiz created.", quiz: sanitizeQuiz(quiz) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─── POST /api/quiz/:quizId/start ─────────────────────────────────────────────
// Start quiz — creator, faculty, or admin only; kicks off socket-driven sequence
exports.startQuiz = async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.quizId);
    if (!quiz) return res.status(404).json({ message: "Quiz not found." });

    // Only creator, FACULTY, or ADMIN may start
    const isCreator = quiz.createdBy.toString() === req.user.userId;
    if (!isCreator && req.user.role === "STUDENT")
      return res.status(403).json({ message: "Only the quiz creator, faculty, or admin can start a quiz." });

    if (quiz.status !== "CREATED")
      return res.status(400).json({ message: `Quiz is already ${quiz.status}.` });

    // Verify starter is a member of the quiz's group
    const member = await isMember(req.user.userId, req.user.role, quiz.groupId.toString());
    if (!member)
      return res.status(403).json({ message: "You are not a member of this group." });

    quiz.status = "RUNNING";
    quiz.startedAt = new Date();
    await quiz.save();

    // The actual question loop is driven by Socket.IO; signal it via a global handler
    const quizHandler = req.app.get("quizHandler");
    if (quizHandler) {
      quizHandler.startQuizSession(quiz);
    }

    res.json({ message: "Quiz started.", quizId: quiz._id, status: quiz.status });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─── GET /api/quiz/:quizId ────────────────────────────────────────────────────
// Get quiz metadata (strip correctIndex for non-ended quizzes)
exports.getQuiz = async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.quizId)
      .populate("createdBy", "email role")
      .populate("groupId", "name branch year section");

    if (!quiz) return res.status(404).json({ message: "Quiz not found." });

    const member = await isMember(req.user.userId, req.user.role, quiz.groupId._id.toString());
    if (!member)
      return res.status(403).json({ message: "You are not a member of this group." });

    const quizObj = quiz.toObject();

    // Hide correctIndex unless quiz has ended
    if (quiz.status !== "ENDED") {
      quizObj.questions = quizObj.questions.map((q) => {
        const { correctIndex, stats, ...safe } = q;
        return safe;
      });
    }

    res.json({ quiz: quizObj });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─── GET /api/quiz/:quizId/results ───────────────────────────────────────────
// Get quiz results — only available after quiz has ended
exports.getQuizResults = async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.quizId)
      .populate("createdBy", "email role")
      .populate("groupId", "name")
      .populate("participants.userId", "email role");

    if (!quiz) return res.status(404).json({ message: "Quiz not found." });

    const member = await isMember(req.user.userId, req.user.role, quiz.groupId._id.toString());
    if (!member)
      return res.status(403).json({ message: "You are not a member of this group." });

    if (quiz.status !== "ENDED")
      return res.status(400).json({ message: "Results are only available after the quiz has ended." });

    // Build sorted leaderboard
    const leaderboard = [...quiz.participants]
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.totalResponseTimeMs - b.totalResponseTimeMs; // faster = higher rank
      })
      .map((p, idx) => ({
        rank: idx + 1,
        userId: p.userId,
        score: p.score,
        totalResponseTimeMs: p.totalResponseTimeMs,
        answers: p.answers,
      }));

    const quizObj = quiz.toObject();

    res.json({
      quiz: {
        _id: quizObj._id,
        title: quizObj.title,
        groupId: quizObj.groupId,
        status: quizObj.status,
        startedAt: quizObj.startedAt,
        endedAt: quizObj.endedAt,
        questions: quizObj.questions, // includes correctIndex and stats post-end
      },
      leaderboard,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─── GET /api/quiz/group/:groupId ─────────────────────────────────────────────
// List quizzes for a group
exports.listGroupQuizzes = async (req, res) => {
  try {
    const { groupId } = req.params;

    const group = await AcademicGroup.findById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found." });

    const member = await isMember(req.user.userId, req.user.role, groupId);
    if (!member)
      return res.status(403).json({ message: "You are not a member of this group." });

    const quizzes = await Quiz.find({ groupId })
      .sort({ createdAt: -1 })
      .populate("createdBy", "email role")
      .lean();

    const result = quizzes.map((q) => ({
      _id: q._id,
      title: q.title,
      status: q.status,
      questionCount: q.questions.length,
      createdBy: q.createdBy,
      roleOfCreator: q.roleOfCreator,
      startedAt: q.startedAt,
      endedAt: q.endedAt,
      participantCount: q.participants.length,
      createdAt: q.createdAt,
    }));

    res.json({ count: result.length, quizzes: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─── Utility: strip correctIndex from quiz output ────────────────────────────
function sanitizeQuiz(quiz) {
  const obj = quiz.toObject ? quiz.toObject() : { ...quiz };
  obj.questions = obj.questions.map((q) => {
    const { correctIndex, stats, ...safe } = q;
    return safe;
  });
  return obj;
}
