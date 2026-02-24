const mongoose = require("mongoose");

const studyPlanSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    subjects: {
      type: [String],
      required: true,
    },
    examDate: {
      type: Date,
      default: null,
    },
    hoursPerDay: {
      type: Number,
      default: 4,
    },
    goals: {
      type: String,
      trim: true,
      default: null,
    },
    plan: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("StudyPlan", studyPlanSchema);
