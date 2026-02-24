const mongoose = require("mongoose");

const forumReplySchema = new mongoose.Schema(
  {
    forumId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ForumThread",
      required: true,
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    parentReplyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ForumReply",
      default: null,
    },
    content: {
      type: String,
      required: [true, "Reply content is required"],
      trim: true,
      maxlength: 2000,
    },
    isEdited: {
      type: Boolean,
      default: false,
    },
    childCount: {
      type: Number,
      default: 0,
    },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    dislikes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

forumReplySchema.index({ forumId: 1, parentReplyId: 1, createdAt: -1 });
forumReplySchema.index({ parentReplyId: 1, createdAt: 1 });

module.exports = mongoose.model("ForumReply", forumReplySchema);
