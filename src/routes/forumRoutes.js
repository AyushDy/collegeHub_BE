const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const fc = require("../controllers/forumController");

// Forum CRUD
router.post("/", protect, fc.createForum);
router.get("/", protect, fc.listForums);
router.get("/:forumId", protect, fc.getForum);
router.delete("/:forumId", protect, fc.deleteForum);

// Replies
router.get("/:forumId/replies", protect, fc.getReplies);
router.post("/:forumId/replies", protect, fc.addReply);
router.put("/replies/:replyId", protect, fc.editReply);
router.delete("/replies/:replyId", protect, fc.deleteReply);

// Like / Dislike — forums
router.patch("/:forumId/like", protect, fc.likeForum);
router.patch("/:forumId/dislike", protect, fc.dislikeForum);

// Like / Dislike — replies
router.patch("/replies/:replyId/like", protect, fc.likeReply);
router.patch("/replies/:replyId/dislike", protect, fc.dislikeReply);

module.exports = router;
