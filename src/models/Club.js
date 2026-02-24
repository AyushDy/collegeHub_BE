const mongoose = require("mongoose");

const clubSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Club name is required"],
      unique: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
    logo: {
      type: String, // Cloudinary URL
      default: null,
    },
    category: {
      type: String,
      enum: ["TECH", "CULTURAL", "SPORTS", "SOCIAL", "OTHER"],
      default: "OTHER",
    },
    leader: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    tags: { type: [String], default: [] },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);



module.exports = mongoose.model("Club", clubSchema);
