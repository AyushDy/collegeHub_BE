const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["ADMIN", "FACULTY", "STUDENT"],
      default: "STUDENT",
    },
    name: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
    },
    profilePicture: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);