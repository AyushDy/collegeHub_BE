const express = require("express");
const router = express.Router();
const groupController = require("../controllers/groupController");
const { protect, authorize } = require("../middleware/authMiddleware");

// My groups — students get their membership groups; faculty/admin get all active groups
router.get("/my", protect, authorize("STUDENT", "FACULTY", "ADMIN"), groupController.getMyGroup);
router.get("/:groupId/open", protect, authorize("STUDENT", "FACULTY", "ADMIN"), groupController.openGroup);

// Admin / Faculty
router.get("/", protect, authorize("ADMIN", "FACULTY"), groupController.listGroups);
router.get("/:groupId/members", protect, authorize("ADMIN", "FACULTY"), groupController.getGroupMembers);

// REST Chat — send & get messages (faculty/admin can participate and moderate)
router.post("/:groupId/chat", protect, authorize("STUDENT", "FACULTY", "ADMIN"), groupController.sendMessage);
router.get("/:groupId/chat", protect, authorize("STUDENT", "FACULTY", "ADMIN"), groupController.getMessages);

module.exports = router;
