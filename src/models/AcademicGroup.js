const mongoose = require("mongoose");

const academicGroupSchema = new mongoose.Schema(
  {
    branch: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    year: {
      type: Number,
      required: true,
      min: 1,
      max: 4,
    },
    section: {
      type: String,
      required: false,
      uppercase: true,
      trim: true,
      default: null,
    },
    // YEAR = year-wide group e.g. CSE-2
    // YEAR_SECTION = section group e.g. CSE-2-A
    type: {
      type: String,
      enum: ["YEAR", "YEAR_SECTION"],
      required: true,
      default: "YEAR_SECTION",
    },
    // Auto-generated unique name e.g. CSE-2 or CSE-2-A
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AcademicGroup", academicGroupSchema);
