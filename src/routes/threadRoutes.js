const express = require("express");
const router = express.Router();
const threadController = require("../controllers/threadController");
const { protect, authorize } = require("../middleware/authMiddleware");

// Thread endpoints
router.post("/:groupId", protect, authorize("STUDENT"), threadController.createThread);
router.get("/:groupId", protect, authorize("STUDENT", "FACULTY", "ADMIN"), threadController.getThreads);

// Single thread + replies
router.get("/thread/:threadId", protect, authorize("STUDENT", "FACULTY", "ADMIN"), threadController.getThread);

// Reply to thread
router.post("/thread/:threadId/reply", protect, authorize("STUDENT", "FACULTY", "ADMIN"), threadController.replyToThread);

// Mark resolved
router.put("/thread/:threadId/resolve", protect, authorize("STUDENT", "FACULTY", "ADMIN"), threadController.resolveThread);

// Accept a reply (thread author only — enforced in controller)
router.put("/reply/:replyId/accept", protect, authorize("STUDENT"), threadController.acceptReply);

module.exports = router;
