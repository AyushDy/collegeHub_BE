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



module.exports = mongoose.model("AcademicResource", academicResourceSchema);
