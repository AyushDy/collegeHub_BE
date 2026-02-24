const { GoogleGenerativeAI } = require("@google/generative-ai");
const Roadmap = require("../models/Roadmap");
const StudyPlan = require("../models/StudyPlan");
const DiscussionThread = require("../models/DiscussionThread");
const DiscussionReply = require("../models/DiscussionReply");
const StudentProfile = require("../models/StudentProfile");
const AiDoubtChat = require("../models/AiDoubtChat");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// Strip markdown code fences that Gemini sometimes wraps JSON in
function parseGeminiJSON(text) {
  const cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/gi, "")
    .trim();
  return JSON.parse(cleaned);
}

// Retry wrapper — handles 429 with exponential backoff (max 3 attempts)
async function generateWithRetry(prompt, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (err) {
      const is429 = err?.status === 429 || err?.message?.includes("429");
      if (is429 && attempt < retries) {
        const delay = 2 ** attempt * 1000; // 2s, 4s, 8s
        await new Promise((res) => setTimeout(res, delay));
      } else {
        throw err;
      }
    }
  }
}

// ─── ROADMAP GENERATOR ───────────────────────────────────────────────────────

// POST /api/ai/roadmap
exports.generateRoadmap = async (req, res) => {
  try {
    const { skill, level = "beginner", goal } = req.body;
    if (!skill || !skill.trim())
      return res.status(400).json({ message: "skill is required" });

    const prompt = `You are an expert CS and tech mentor. Generate a practical, project-based learning roadmap as a directed graph suitable for rendering as a flowchart.

Skill to learn: "${skill.trim()}"
Learner level: ${level}
Goal: ${goal?.trim() || "General proficiency and job-readiness"}

Rules:
- Model the roadmap as a graph of nodes and directed edges.
- node types:
    "start"     — single entry node (e.g. "Start: Learn ${skill.trim()}")
    "topic"     — a concept or technology to learn
    "project"   — a hands-on project to build
    "milestone" — a phase checkpoint / summary node
    "end"       — single exit node (e.g. "Job Ready / Goal Achieved")
- Each node must have a unique "id" (e.g. "n1", "n2", ...) within this roadmap.
- Each node should have: label (short, ≤ 6 words), description (1–3 sentences explaining what to learn/do), phase (integer grouping, 1-based), resources (real well-known URLs — YouTube, official docs, freeCodeCamp etc.), estimatedDuration.
- Edges define prerequisites: { from, to, label? }. Label is optional (e.g. "after", "then", "optional").
- Aim for 15–30 nodes total. A linear roadmap is fine; branches are allowed for optional/parallel tracks.
- Resources must be real and preferably free.
- Keep durations realistic for a college student with ~2–3 hours/day.

Return ONLY valid JSON matching this exact schema (no extra text, no markdown):
{
  "skill": string,
  "overview": string,
  "totalDuration": string,
  "nodes": [
    {
      "id": string,
      "type": "start" | "topic" | "project" | "milestone" | "end",
      "label": string,
      "description": string,
      "phase": number,
      "resources": [
        { "title": string, "url": string, "type": "video|article|docs|book|course" }
      ],
      "estimatedDuration": string
    }
  ],
  "edges": [
    { "from": string, "to": string, "label": string }
  ],
  "tips": string[]
}`;

    const text = await generateWithRetry(prompt);
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

    const text = await generateWithRetry(prompt);
    const plan = parseGeminiJSON(text);

    const saved = await StudyPlan.create({
      userId: req.user.userId,
      subjects,
      examDate: examDate ? new Date(examDate) : null,
      hoursPerDay,
      goals: goals?.trim() || null,
      plan,
    });

    res.status(201).json({ message: "Study plan generated", studyPlan: saved });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/ai/study-plan — list all saved study plans for current user (summary)
exports.getStudyPlans = async (req, res) => {
  try {
    const plans = await StudyPlan.find({ userId: req.user.userId })
      .sort({ createdAt: -1 })
      .select("subjects examDate hoursPerDay goals createdAt");

    res.json({ count: plans.length, studyPlans: plans });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/ai/study-plan/:planId — get full study plan
exports.getStudyPlan = async (req, res) => {
  try {
    const studyPlan = await StudyPlan.findOne({
      _id: req.params.planId,
      userId: req.user.userId,
    });
    if (!studyPlan) return res.status(404).json({ message: "Study plan not found" });

    res.json({ studyPlan });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// DELETE /api/ai/study-plan/:planId
exports.deleteStudyPlan = async (req, res) => {
  try {
    const studyPlan = await StudyPlan.findOneAndDelete({
      _id: req.params.planId,
      userId: req.user.userId,
    });
    if (!studyPlan) return res.status(404).json({ message: "Study plan not found" });

    res.json({ message: "Study plan deleted" });
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

    const text = await generateWithRetry(prompt);
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

    const text = await generateWithRetry(prompt);
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

    const text = await generateWithRetry(prompt);
    const suggestions = parseGeminiJSON(text);

    res.json({ message: "Study suggestions generated", suggestions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─── AI DOUBT CHAT ──────────────────────────────────────────────────────────────────

// POST /api/ai/doubt-chat
// Conversational AI tutor. Sends a question (and optional image), gets a response.
// History is persisted per user and used as context on every call.
exports.doubtChat = async (req, res) => {
  try {
    const { question } = req.body;
    const imageFile = req.file; // populated by multer-cloudinary when image is uploaded

    // At least one of question or image is required
    if ((!question || !question.trim()) && !imageFile)
      return res.status(400).json({ message: "question or an image is required" });

    // Load or create session for this user
    let session = await AiDoubtChat.findOne({ userId: req.user.userId });
    if (!session) {
      session = await AiDoubtChat.create({ userId: req.user.userId, messages: [] });
    }

    // Build Gemini history from saved messages (max last 20 turns, text-only)
    const recent = session.messages.slice(-40); // 20 pairs
    const history = recent.map((m) => ({
      role: m.role,
      parts: [{ text: m.content || "" }],
    }));

    const chat = model.startChat({
      history,
      systemInstruction: {
        parts: [{
          text: `You are CollegeHub's AI academic tutor. Help students with any academic doubt clearly and concisely.
- Keep answers focused and structured.
- Use examples where helpful.
- If a question is unrelated to academics, politely redirect the student.
- When an image is included, analyse it carefully before answering.`,
        }],
      },
    });

    // Build current message parts (text + optional image)
    const parts = [];
    if (question && question.trim()) parts.push({ text: question.trim() });

    if (imageFile) {
      // imageFile.path is the Cloudinary public URL
      const fetchRes = await fetch(imageFile.path);
      const arrayBuffer = await fetchRes.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      parts.push({ inlineData: { mimeType: imageFile.mimetype, data: base64 } });
    }

    const result = await chat.sendMessage(parts);
    const answer = result.response.text();

    // Persist both turns
    const userContent = question ? question.trim() : "";
    const uploadedImageUrl = imageFile ? imageFile.path : null;

    session.messages.push({ role: "user", content: userContent, imageUrl: uploadedImageUrl });
    session.messages.push({ role: "model", content: answer });
    await session.save();

    res.json({
      question: userContent || undefined,
      imageUrl: uploadedImageUrl || undefined,
      answer,
      totalMessages: session.messages.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/ai/doubt-chat
// Retrieve the authenticated user's full AI doubt chat history.
exports.getDoubtChat = async (req, res) => {
  try {
    const session = await AiDoubtChat.findOne({ userId: req.user.userId }).lean();
    if (!session) return res.json({ messages: [], total: 0 });

    res.json({
      messages: session.messages,
      total: session.messages.length,
      updatedAt: session.updatedAt,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// DELETE /api/ai/doubt-chat
// Clear the authenticated user's AI doubt chat history.
exports.clearDoubtChat = async (req, res) => {
  try {
    await AiDoubtChat.findOneAndUpdate(
      { userId: req.user.userId },
      { $set: { messages: [] } }
    );
    res.json({ message: "Chat history cleared" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
