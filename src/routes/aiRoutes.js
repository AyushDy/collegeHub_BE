const express = require("express");
const router = express.Router();
const aiController = require("../controllers/aiController");
const { protect, authorize } = require("../middleware/authMiddleware");

// ─── AI ROADMAP GENERATOR ──────────────────────────────────────────────────
// POST /api/ai/roadmap          — generate & save a new skill roadmap
// GET  /api/ai/roadmap          — list all saved roadmaps (summary)
// GET  /api/ai/roadmap/:id      — fetch full roadmap by ID

router.post("/roadmap", protect, aiController.generateRoadmap);
router.get("/roadmap", protect, aiController.getRoadmaps);
router.get("/roadmap/:roadmapId", protect, aiController.getRoadmap);

// ─── PERSONALIZED STUDY PLAN BUILDER ──────────────────────────────────────
// POST /api/ai/study-plan       — generate a weekly study plan
// Body: { subjects, examDate?, hoursPerDay?, goals? }

router.post("/study-plan", protect, aiController.generateStudyPlan);

// ─── SMART DOUBT ASSISTANCE ────────────────────────────────────────────────
// POST /api/ai/doubt-assist/:threadId — AI-suggested reply for a thread

router.post("/doubt-assist/:threadId", protect, aiController.doubtAssist);

// ─── RESOURCE RECOMMENDATIONS ─────────────────────────────────────────────
// GET  /api/ai/recommendations  — personalised resources from student profile

router.get("/recommendations", protect, authorize("STUDENT"), aiController.getRecommendations);

// ─── PERFORMANCE-BASED STUDY SUGGESTIONS ──────────────────────────────────
// POST /api/ai/study-suggestions
// Body: { weakSubjects, strongSubjects?, recentScores?, goals? }

router.post("/study-suggestions", protect, aiController.studySuggestions);

module.exports = router;
