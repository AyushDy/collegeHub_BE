const mongoose = require("mongoose");

// ── Sub-schema: a single answer a participant submitted ───────────────────────
const answerSchema = new mongoose.Schema(
  {
    questionIndex: { type: Number, required: true },
    selectedIndex: { type: Number, required: true }, // -1 means no answer (timeout)
    isCorrect: { type: Boolean, required: true },
    responseTimeMs: { type: Number, default: 0 }, // ms from when question was emitted
  },
  { _id: false }
);

// ── Sub-schema: one participant and their accumulated results ─────────────────
const participantSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    score: { type: Number, default: 0 },
    totalResponseTimeMs: { type: Number, default: 0 }, // tie-breaker (lower = better)
    answers: { type: [answerSchema], default: [] },
  },
  { _id: false }
);

// ── Sub-schema: per-question statistics (populated after question closes) ─────
const questionStatsSchema = new mongoose.Schema(
  {
    // how many participants chose each option (parallel array to question.options)
    optionCounts: { type: [Number], default: [] },
    correctCount: { type: Number, default: 0 }, // participants who got it right
  },
  { _id: false }
);

// ── Sub-schema: one question ──────────────────────────────────────────────────
const questionSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: true,
      trim: true,
    },
    options: {
      type: [String],
      validate: {
        validator: (arr) => arr.length >= 2 && arr.length <= 6,
        message: "Each question must have between 2 and 6 options.",
      },
      required: true,
    },
    correctIndex: {
      type: Number,
      required: true,
      min: 0,
    },
    timeLimit: {
      type: Number,
      required: true,
      min: 5,
      max: 600,
    },
    // Filled in after question closes
    stats: { type: questionStatsSchema, default: () => ({}) },
  },
  { _id: false }
);

// ── Root quiz schema ──────────────────────────────────────────────────────────
const quizSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 200,
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicGroup",
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    roleOfCreator: {
      type: String,
      enum: ["STUDENT", "FACULTY", "ADMIN"],
      required: true,
    },
    status: {
      type: String,
      enum: ["CREATED", "RUNNING", "ENDED"],
      default: "CREATED",
    },
    questions: {
      type: [questionSchema],
      validate: {
        validator: (arr) => arr && arr.length >= 1,
        message: "A quiz must have at least one question.",
      },
      required: true,
    },
    participants: { type: [participantSchema], default: [] },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

quizSchema.index({ groupId: 1, createdAt: -1 });
quizSchema.index({ createdBy: 1 });
quizSchema.index({ status: 1 });

module.exports = mongoose.model("Quiz", quizSchema);
