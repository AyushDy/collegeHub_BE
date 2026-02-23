const mongoose = require("mongoose");

const DRIVE_URL_REGEX = /^https:\/\/drive\.google\.com\/.+/;
const SECTION_REGEX = /^[A-Z]$/;

const studentProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    branch: {
      type: String,
      required: [true, "Branch is required"],
      trim: true,
    },
    year: {
      type: Number,
      required: [true, "Year is required"],
      min: [1, "Year must be between 1 and 4"],
      max: [4, "Year must be between 1 and 4"],
    },
    section: {
      type: String,
      required: [true, "Section is required"],
      uppercase: true,
      trim: true,
      match: [SECTION_REGEX, "Section must be a single uppercase letter (e.g. A, B)"],
    },
    rollNumber: {
      type: String,
      required: [true, "Roll number is required"],
      trim: true,
    },
    skills: {
      type: [String],
      default: [],
    },
    interests: {
      type: [String],
      default: [],
    },
    resumeLink: {
      type: String,
      trim: true,
      match: [DRIVE_URL_REGEX, "Resume must be a valid Google Drive URL"],
      default: null,
    },
    portfolioLink: {
      type: String,
      trim: true,
      match: [DRIVE_URL_REGEX, "Portfolio must be a valid Google Drive URL"],
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);


module.exports = mongoose.model("StudentProfile", studentProfileSchema);
