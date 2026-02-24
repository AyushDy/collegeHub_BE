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

clubSchema.index({ isActive: 1, category: 1 });
clubSchema.index({ leader: 1 });
clubSchema.index({ name: "text", tags: "text" });

module.exports = mongoose.model("Club", clubSchema);
