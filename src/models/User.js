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
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);