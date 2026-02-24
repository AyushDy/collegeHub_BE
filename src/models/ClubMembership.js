const mongoose = require("mongoose");

const clubMembershipSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    clubId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Club",
      required: true,
    },
    role: {
      type: String,
      enum: ["LEADER", "CO_LEADER", "MEMBER"],
      default: "MEMBER",
    },
  },
  { timestamps: true }
);

clubMembershipSchema.index({ userId: 1, clubId: 1 }, { unique: true });
clubMembershipSchema.index({ clubId: 1 });
clubMembershipSchema.index({ userId: 1 });

module.exports = mongoose.model("ClubMembership", clubMembershipSchema);
