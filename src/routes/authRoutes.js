const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");
const uploadImage = require("../middleware/uploadImage");

router.post("/register", authController.register);
router.post("/login", authController.login);
router.get("/me", protect, authController.getMe);
router.post("/logout", authController.logout);

// Profile picture
router.patch("/profile-picture", protect, uploadImage("profile_pictures").single("image"), authController.uploadProfilePicture);
router.delete("/profile-picture", protect, authController.deleteProfilePicture);

module.exports = router;