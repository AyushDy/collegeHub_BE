const express = require("express");
const router = express.Router();
const groupController = require("../controllers/groupController");
const { protect, authorize } = require("../middleware/authMiddleware");

// Student
router.get("/my", protect, authorize("STUDENT"), groupController.getMyGroup);
router.get("/:groupId/open", protect, authorize("STUDENT", "FACULTY", "ADMIN"), groupController.openGroup);

// Admin / Faculty
router.get("/", protect, authorize("ADMIN", "FACULTY"), groupController.listGroups);
router.get("/:groupId/members", protect, authorize("ADMIN", "FACULTY"), groupController.getGroupMembers);

// REST Chat — send & get messages
router.post("/:groupId/chat", protect, authorize("STUDENT"), groupController.sendMessage);
router.get("/:groupId/chat", protect, authorize("STUDENT", "FACULTY", "ADMIN"), groupController.getMessages);

module.exports = router;
