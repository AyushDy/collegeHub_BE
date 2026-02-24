const mongoose = require("mongoose");

const academicResourceSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["SYLLABUS", "PYQ", "LECTURE_NOTE"],
      required: true,
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicGroup",
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    subject: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "General",
    },
    // For PYQs: exam year / session label (e.g. "2025", "2024-Mid")
    examYear: {
      type: String,
      trim: true,
      maxlength: 20,
      default: null,
    },
    fileName: { type: String, required: true },
    filePath: { type: String, required: true },
    fileSize: { type: Number, required: true },
    mimeType: { type: String, default: "application/pdf" },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    tags: { type: [String], default: [] },
  },
  { timestamps: true }
);

academicResourceSchema.index({ groupId: 1, type: 1, createdAt: -1 });
academicResourceSchema.index({ groupId: 1, subject: 1 });
academicResourceSchema.index({ uploadedBy: 1 });
academicResourceSchema.index({ title: "text", subject: "text", tags: "text" });

module.exports = mongoose.model("AcademicResource", academicResourceSchema);
