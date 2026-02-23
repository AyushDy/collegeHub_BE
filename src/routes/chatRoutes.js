const express = require("express");
const router = express.Router();
const chatController = require("../controllers/chatController");
const { protect, authorize } = require("../middleware/authMiddleware");

// Edit / Delete own message (student only)
router.put("/:messageId", protect, authorize("STUDENT"), chatController.editMessage);
router.delete("/:messageId", protect, authorize("STUDENT"), chatController.deleteMessage);

module.exports = router;
