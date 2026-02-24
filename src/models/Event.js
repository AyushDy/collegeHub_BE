const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema(
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
      maxlength: 3000,
      default: "",
    },
    poster: {
      type: String, // Cloudinary URL
      default: null,
    },
    date: {
      type: Date,
      required: [true, "Event date is required"],
    },
    time: {
      type: String, // e.g. "10:00 AM - 2:00 PM"
      trim: true,
      default: null,
    },
    venue: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null,
    },
    // COLLEGE = college-wide, GROUP = scoped to a group, CLUB = future
    type: {
      type: String,
      enum: ["COLLEGE", "GROUP", "CLUB"],
      default: "COLLEGE",
    },
    // Optional — set when type is GROUP (or CLUB in the future)
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicGroup",
      default: null,
    },
    organizer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    tags: { type: [String], default: [] },
    rsvps: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

eventSchema.index({ isActive: 1, date: -1 });
eventSchema.index({ type: 1, isActive: 1 });
eventSchema.index({ groupId: 1, isActive: 1 });
eventSchema.index({ organizer: 1 });
eventSchema.index({ title: "text", tags: "text" });

module.exports = mongoose.model("Event", eventSchema);
