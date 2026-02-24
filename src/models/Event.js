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
    // Set when type is GROUP
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicGroup",
      default: null,
    },
    // Set when type is CLUB
    clubId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Club",
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



module.exports = mongoose.model("Event", eventSchema);
