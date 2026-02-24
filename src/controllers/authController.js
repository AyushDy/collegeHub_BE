const User = require("../models/User");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cloudinary = require("../config/cloudinary");

exports.register = async (req, res) => {
  try {
    const { email, password, role, name } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      email,
      password: hashedPassword,
      role,
      name: name?.trim() || null,
    });

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({
      message: "User created",
      user: { id: user._id, email: user.email, role: user.role, name: user.name, profilePicture: user.profilePicture },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.logout = (req, res) => {
  res.clearCookie("token");
  res.json({ message: "Logged out" });
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user)
      return res.status(400).json({ message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ message: "Logged in", user: { id: user._id, email: user.email, role: user.role, name: user.name, profilePicture: user.profilePicture } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// PATCH /api/auth/profile-picture — upload profile picture (all roles)
exports.uploadProfilePicture = async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ message: "Image file is required" });

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Delete old image from Cloudinary if exists
    if (user.profilePicture) {
      const publicId = user.profilePicture.split("/").slice(-2).join("/").split(".")[0];
      await cloudinary.uploader.destroy(`collegehub/${publicId}`).catch(() => {});
    }

    user.profilePicture = req.file.path;
    await user.save();

    res.json({ message: "Profile picture updated", profilePicture: user.profilePicture });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// DELETE /api/auth/profile-picture — remove profile picture
exports.deleteProfilePicture = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.profilePicture) {
      const publicId = user.profilePicture.split("/").slice(-2).join("/").split(".")[0];
      await cloudinary.uploader.destroy(`collegehub/${publicId}`).catch(() => {});
      user.profilePicture = null;
      await user.save();
    }

    res.json({ message: "Profile picture removed" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};