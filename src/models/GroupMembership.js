const mongoose = require("mongoose");

const groupMembershipSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicGroup",
      required: true,
    },
    // System-generated groups cannot be left by students
    isSystemGenerated: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Unique membership per user per group
groupMembershipSchema.index({ userId: 1, groupId: 1 }, { unique: true });


module.exports = mongoose.model("GroupMembership", groupMembershipSchema);
