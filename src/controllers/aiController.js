const { GoogleGenerativeAI } = require("@google/generative-ai");
const Roadmap = require("../models/Roadmap");
const DiscussionThread = require("../models/DiscussionThread");
const DiscussionReply = require("../models/DiscussionReply");
const StudentProfile = require("../models/StudentProfile");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Strip markdown code fences that Gemini sometimes wraps JSON in
function parseGeminiJSON(text) {
  const cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/gi, "")
    .trim();
  return JSON.parse(cleaned);
}

// ─── ROADMAP GENERATOR ───────────────────────────────────────────────────────

// POST /api/ai/roadmap
exports.generateRoadmap = async (req, res) => {
  try {
    const { skill, level = "beginner", goal } = req.body;
    if (!skill || !skill.trim())
      return res.status(400).json({ message: "skill is required" });

    const prompt = `You are an expert CS and tech mentor. Generate a practical, project-based learning roadmap.

Skill to learn: "${skill.trim()}"
Learner level: ${level}
Goal: ${goal?.trim() || "General proficiency and job-readiness"}

Rules:
- Each phase must include real, hands-on projects.
- Resources must be real, well-known, and preferably free (YouTube channels, official docs, freeCodeCamp, etc.).
- Keep durations realistic for a college student with ~2-3 hours/day.

Return ONLY valid JSON matching this exact schema (no extra text, no markdown):
{
  "skill": string,
  "overview": string,
  "totalDuration": string,
  "phases": [
    {
      "phase": number,
      "title": string,
      "duration": string,
      "topics": string[],
      "resources": [
        { "title": string, "url": string, "type": "video|article|docs|book|course" }
      ],
      "project": { "title": string, "description": string }
    }
  ],
  "finalProject": { "title": string, "description": string },
  "tips": string[]
}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const roadmapData = parseGeminiJSON(text);

    const saved = await Roadmap.create({
      userId: req.user.userId,
      skill: skill.trim(),
      level,
      goal: goal?.trim() || null,
      roadmap: roadmapData,
    });

    res.status(201).json({ message: "Roadmap generated", roadmap: saved });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/ai/roadmap — list all saved roadmaps for current user (summary)
exports.getRoadmaps = async (req, res) => {
  try {
    const roadmaps = await Roadmap.find({ userId: req.user.userId })
      .sort({ createdAt: -1 })
      .select("skill level goal createdAt");

    res.json({ count: roadmaps.length, roadmaps });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/ai/roadmap/:roadmapId — get full roadmap
exports.getRoadmap = async (req, res) => {
  try {
    const roadmap = await Roadmap.findOne({
      _id: req.params.roadmapId,
      userId: req.user.userId,
    });
    if (!roadmap) return res.status(404).json({ message: "Roadmap not found" });

    res.json({ roadmap });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// DELETE /api/ai/roadmap/:roadmapId
exports.deleteRoadmap = async (req, res) => {
  try {
    const roadmap = await Roadmap.findOneAndDelete({
      _id: req.params.roadmapId,
      userId: req.user.userId,
    });
    if (!roadmap) return res.status(404).json({ message: "Roadmap not found" });

    res.json({ message: "Roadmap deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─── PERSONALIZED STUDY PLAN BUILDER ─────────────────────────────────────────

// POST /api/ai/study-plan
// Body: { subjects: string[], examDate?: ISO date string, hoursPerDay?: number, goals?: string }
exports.generateStudyPlan = async (req, res) => {
  try {
    const { subjects, examDate, hoursPerDay = 4, goals } = req.body;

    if (!subjects || !Array.isArray(subjects) || subjects.length === 0)
      return res.status(400).json({ message: "subjects array is required" });

    const daysUntilExam = examDate
      ? Math.max(1, Math.ceil((new Date(examDate) - new Date()) / (1000 * 60 * 60 * 24)))
      : 30;

    const prompt = `You are an academic performance coach for college students.

Subjects to study: ${subjects.join(", ")}
Days until exam/deadline: ${daysUntilExam}
Available hours per day: ${hoursPerDay}
Goals: ${goals?.trim() || "Exam preparation and conceptual clarity"}

Create a detailed, realistic weekly study plan. Distribute subjects intelligently based on typical difficulty.

Return ONLY valid JSON (no markdown, no extra text):
{
  "totalWeeks": number,
  "dailyHours": number,
  "weeklyPlan": [
    {
      "week": number,
      "focus": string,
      "dailySchedule": [
        {
          "day": string,
          "subject": string,
          "topics": string[],
          "hours": number,
          "task": string
        }
      ]
    }
  ],
  "revisionStrategy": string,
  "tips": string[]
}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const plan = parseGeminiJSON(text);

    res.json({ message: "Study plan generated", plan });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─── SMART DOUBT ASSISTANCE ──────────────────────────────────────────────────

// POST /api/ai/doubt-assist/:threadId
// Reads the thread + existing replies and returns an AI-suggested answer
exports.doubtAssist = async (req, res) => {
  try {
    const thread = await DiscussionThread.findById(req.params.threadId).populate(
      "author",
      "role"
    );
    if (!thread) return res.status(404).json({ message: "Thread not found" });

    const replies = await DiscussionReply.find({ threadId: thread._id })
      .sort({ createdAt: 1 })
      .limit(10)
      .populate("author", "role");

    const repliesText =
      replies.length > 0
        ? replies
            .map((r, i) => `Reply ${i + 1} (${r.author.role}): ${r.content}`)
            .join("\n")
        : "No replies yet.";

    const prompt = `You are a knowledgeable academic tutor. A student posted this doubt in a college discussion forum.

Subject: ${thread.subject}
Question Title: "${thread.title}"
Detailed Question: ${thread.content}

Existing replies in the thread:
${repliesText}

Write a clear, accurate, and educational answer. ${
      replies.length > 0
        ? "Build upon or correct existing replies where needed."
        : "Since no one has replied yet, provide a comprehensive answer."
    }

Return ONLY valid JSON (no markdown):
{
  "suggestedReply": string,
  "keyPoints": string[],
  "relatedTopics": string[],
  "confidence": "high|medium|low"
}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const suggestion = parseGeminiJSON(text);

    res.json({
      message: "AI suggestion generated",
      threadId: thread._id,
      threadTitle: thread.title,
      suggestion,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─── RESOURCE RECOMMENDATIONS ────────────────────────────────────────────────

// GET /api/ai/recommendations
// Uses the student's saved profile (branch, year, skills, interests)
exports.getRecommendations = async (req, res) => {
  try {
    const profile = await StudentProfile.findOne({ userId: req.user.userId });
    if (!profile)
      return res.status(404).json({ message: "Student profile not found. Create a profile first." });

    const prompt = `You are a smart academic advisor for an engineering college student.

Student Profile:
- Branch: ${profile.branch}
- Year: ${profile.year} (out of 4)
- Known Skills: ${profile.skills?.join(", ") || "Not specified"}
- Interests: ${profile.interests?.join(", ") || "Not specified"}

Recommend exactly 10 high-quality, curated learning resources tailored to this student. Prioritize free resources. Mix video courses, articles, and documentation.

Return ONLY valid JSON (no markdown):
{
  "focusAreas": string[],
  "recommendations": [
    {
      "title": string,
      "description": string,
      "url": string,
      "type": "video|course|article|book|tool|documentation",
      "topic": string,
      "difficulty": "beginner|intermediate|advanced",
      "isFree": boolean,
      "estimatedTime": string
    }
  ]
}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const data = parseGeminiJSON(text);

    res.json({ message: "Recommendations generated", data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─── PERFORMANCE-BASED STUDY SUGGESTIONS ─────────────────────────────────────

// POST /api/ai/study-suggestions
// Body: { weakSubjects: string[], strongSubjects?: string[], recentScores?: { [subject]: number }, goals?: string }
exports.studySuggestions = async (req, res) => {
  try {
    const { weakSubjects, strongSubjects, recentScores, goals } = req.body;

    if (!weakSubjects || !Array.isArray(weakSubjects) || weakSubjects.length === 0)
      return res.status(400).json({ message: "weakSubjects array is required" });

    const scoresText = recentScores
      ? Object.entries(recentScores)
          .map(([subject, score]) => `${subject}: ${score}%`)
          .join(", ")
      : "Not provided";

    const prompt = `You are a student performance coach who analyzes academic data and gives actionable improvement strategies.

Performance Data:
- Weak subjects: ${weakSubjects.join(", ")}
- Strong subjects: ${strongSubjects?.join(", ") || "Not specified"}
- Recent scores: ${scoresText}
- Student goals: ${goals?.trim() || "Improve overall academic performance"}

Analyse the pattern and give targeted, prioritized suggestions. Be specific and practical.

Return ONLY valid JSON (no markdown):
{
  "analysis": string,
  "prioritySubjects": string[],
  "suggestions": [
    {
      "subject": string,
      "issue": string,
      "strategy": string,
      "resources": string[],
      "weeklyHours": number
    }
  ],
  "milestones": string[],
  "motivationalTip": string
}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const suggestions = parseGeminiJSON(text);

    res.json({ message: "Study suggestions generated", suggestions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
