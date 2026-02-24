const express = require("express");
const router = express.Router();
const aiController = require("../controllers/aiController");
const { protect, authorize } = require("../middleware/authMiddleware");
const uploadImage = require("../middleware/uploadImage");

// ─── AI ROADMAP GENERATOR ──────────────────────────────────────────────────
// POST   /api/ai/roadmap          — generate & save a new skill roadmap
// GET    /api/ai/roadmap          — list all saved roadmaps (summary)
// GET    /api/ai/roadmap/:id      — fetch full roadmap by ID
// DELETE /api/ai/roadmap/:id      — delete a roadmap (owner only)

router.post("/roadmap", protect, aiController.generateRoadmap);
router.get("/roadmap", protect, aiController.getRoadmaps);
router.get("/roadmap/:roadmapId", protect, aiController.getRoadmap);
router.delete("/roadmap/:roadmapId", protect, aiController.deleteRoadmap);

// ─── PERSONALIZED STUDY PLAN BUILDER ──────────────────────────────────────
// POST   /api/ai/study-plan          — generate & save a weekly study plan
// GET    /api/ai/study-plan          — list all saved study plans (summary)
// GET    /api/ai/study-plan/:planId  — fetch full study plan by ID
// DELETE /api/ai/study-plan/:planId  — delete a study plan (owner only)
// Body: { subjects, examDate?, hoursPerDay?, goals? }

router.post("/study-plan", protect, aiController.generateStudyPlan);
router.get("/study-plan", protect, aiController.getStudyPlans);
router.get("/study-plan/:planId", protect, aiController.getStudyPlan);
router.delete("/study-plan/:planId", protect, aiController.deleteStudyPlan);

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
// ─── AI DOUBT CHAT (conversational, history persisted) ─────────────────────────
// POST   /api/ai/doubt-chat        — ask a question (+ optional image), get AI answer
// GET    /api/ai/doubt-chat        — fetch full chat history for current user
// DELETE /api/ai/doubt-chat        — clear chat history

router.post("/doubt-chat", protect, uploadImage("ai_doubt_chat").single("image"), aiController.doubtChat);
router.get("/doubt-chat", protect, aiController.getDoubtChat);
router.delete("/doubt-chat", protect, aiController.clearDoubtChat);
module.exports = router;
