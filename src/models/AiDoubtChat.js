const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["user", "model"],
      required: true,
    },
    content: {
      type: String,
      default: "",   // may be empty when user sends only an image
    },
    imageUrl: {
      type: String,
      default: null, // Cloudinary URL; only set on user messages
    },
  },
  { timestamps: true }
);

const aiDoubtChatSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // one session per user, append messages
    },
    messages: {
      type: [messageSchema],
      default: [],
    },
  },
  { timestamps: true }
);

aiDoubtChatSchema.index({ userId: 1 });

module.exports = mongoose.model("AiDoubtChat", aiDoubtChatSchema);
