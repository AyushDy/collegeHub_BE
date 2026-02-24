const mongoose = require("mongoose");

const forumThreadSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
    topic: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "General",
    },
    tags: { type: [String], default: [] },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    replyCount: {
      type: Number,
      default: 0,
    },
    lastActivity: {
      type: Date,
      default: Date.now,
    },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    dislikes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

forumThreadSchema.index({ isActive: 1, lastActivity: -1 });
forumThreadSchema.index({ topic: 1, isActive: 1 });
forumThreadSchema.index({ createdBy: 1 });
forumThreadSchema.index({ title: "text", topic: "text", tags: "text" });

module.exports = mongoose.model("ForumThread", forumThreadSchema);
