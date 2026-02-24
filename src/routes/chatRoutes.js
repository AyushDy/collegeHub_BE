const express = require("express");
const router = express.Router();
const chatController = require("../controllers/chatController");
const { protect, authorize } = require("../middleware/authMiddleware");

// Edit own message (student only — faculty should not put words in students' mouths)
router.put("/:messageId", protect, authorize("STUDENT"), chatController.editMessage);
// Delete: own message (student) or any message for moderation (faculty/admin)
router.delete("/:messageId", protect, authorize("STUDENT", "FACULTY", "ADMIN"), chatController.deleteMessage);

module.exports = router;
