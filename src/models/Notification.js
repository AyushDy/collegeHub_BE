const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    targetGroupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicGroup",
      default: null,
    },
    // Supported types: QUIZ, EVENT, CLUB — expand as needed
    type: {
      type: String,
      enum: ["QUIZ", "EVENT", "CLUB"],
      required: true,
    },
    // Flexible payload — shape depends on type
    payload: {
      quizId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Quiz",
        default: null,
      },
      eventId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Event",
        default: null,
      },
      clubId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Club",
        default: null,
      },
      title: { type: String, default: null },
      message: { type: String, default: null },
      createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      startAt: { type: Date, default: null },
      eventDate: { type: Date, default: null },
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);



module.exports = mongoose.model("Notification", notificationSchema);
