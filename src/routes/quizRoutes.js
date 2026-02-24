const express = require("express");
const router = express.Router();
const quizController = require("../controllers/quizController");
const { protect, authorize } = require("../middleware/authMiddleware");

// Any authenticated member can create a quiz for their group
router.post("/", protect, authorize("STUDENT", "FACULTY", "ADMIN"), quizController.createQuiz);

// Start a quiz — creator, faculty, or admin (role check is enforced in controller)
router.post("/:quizId/start", protect, authorize("STUDENT", "FACULTY", "ADMIN"), quizController.startQuiz);

// Get quiz metadata (correctIndex hidden for non-ended quizzes)
router.get("/:quizId", protect, authorize("STUDENT", "FACULTY", "ADMIN"), quizController.getQuiz);

// Get final results and leaderboard (only available after ENDED)
router.get("/:quizId/results", protect, authorize("STUDENT", "FACULTY", "ADMIN"), quizController.getQuizResults);

// List quizzes for a group
router.get("/group/:groupId", protect, authorize("STUDENT", "FACULTY", "ADMIN"), quizController.listGroupQuizzes);

module.exports = router;
