const DiscussionThread = require("../models/DiscussionThread");
const DiscussionReply = require("../models/DiscussionReply");
const AcademicGroup = require("../models/AcademicGroup");
const { isMember } = require("../utils/groupMembership");

// ─── THREAD ENDPOINTS ─────────────────────────────────────────────────────────

// POST /api/threads/:groupId — create thread (STUDENT, must be in group)
exports.createThread = async (req, res) => {
  try {
    const group = await AcademicGroup.findById(req.params.groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    const member = await isMember(req.user.userId, req.user.role, req.params.groupId);
    if (!member)
      return res.status(403).json({ message: "You are not a member of this group" });

    const { title, content, subject } = req.body;
    if (!title || !content)
      return res.status(400).json({ message: "Title and content are required" });

    const thread = await DiscussionThread.create({
      groupId: req.params.groupId,
      author: req.user.userId,
      title: title.trim(),
      content: content.trim(),
      subject: subject ? subject.trim() : "General",
    });

    const populated = await thread.populate("author", "email role");
    res.status(201).json({ message: "Thread created", thread: populated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/threads/:groupId — list threads for a group (paginated, filterable)
exports.getThreads = async (req, res) => {
  try {
    const group = await AcademicGroup.findById(req.params.groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    const member = await isMember(req.user.userId, req.user.role, req.params.groupId);
    if (!member)
      return res.status(403).json({ message: "You are not a member of this group" });

    const { subject, resolved, page = 1, limit = 20 } = req.query;
    const filter = { groupId: req.params.groupId };

    if (subject) filter.subject = { $regex: new RegExp(subject, "i") };
    if (resolved !== undefined) filter.isResolved = resolved === "true";

    const skip = (Math.max(1, Number(page)) - 1) * Math.min(100, Number(limit));
    const pageLimit = Math.min(100, Number(limit));

    const [threads, total] = await Promise.all([
      DiscussionThread.find(filter)
        .populate("author", "email role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageLimit),
      DiscussionThread.countDocuments(filter),
    ]);

    res.json({ total, page: Number(page), limit: pageLimit, threads });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/thread/:threadId — get single thread with replies
exports.getThread = async (req, res) => {
  try {
    const thread = await DiscussionThread.findById(req.params.threadId)
      .populate("author", "email role")
      .populate("resolvedBy", "email role");

    if (!thread) return res.status(404).json({ message: "Thread not found" });

    const member = await isMember(req.user.userId, req.user.role, thread.groupId.toString());
    if (!member)
      return res.status(403).json({ message: "You are not a member of this group" });

    const replies = await DiscussionReply.find({ threadId: req.params.threadId })
      .populate("author", "email role")
      .sort({ createdAt: 1 });

    res.json({ thread, replies });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─── REPLY ENDPOINTS ──────────────────────────────────────────────────────────

// POST /api/thread/:threadId/reply — reply to thread (all roles, must be member)
exports.replyToThread = async (req, res) => {
  try {
    const thread = await DiscussionThread.findById(req.params.threadId);
    if (!thread) return res.status(404).json({ message: "Thread not found" });

    const member = await isMember(req.user.userId, req.user.role, thread.groupId.toString());
    if (!member)
      return res.status(403).json({ message: "You are not a member of this group" });

    const { content } = req.body;
    if (!content || !content.trim())
      return res.status(400).json({ message: "Reply content is required" });

    const reply = await DiscussionReply.create({
      threadId: req.params.threadId,
      author: req.user.userId,
      content: content.trim(),
    });

    const populated = await reply.populate("author", "email role");
    res.status(201).json({ message: "Reply added", reply: populated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// PUT /api/thread/:threadId/resolve — mark thread as resolved
exports.resolveThread = async (req, res) => {
  try {
    const thread = await DiscussionThread.findById(req.params.threadId);
    if (!thread) return res.status(404).json({ message: "Thread not found" });

    // Author OR faculty/admin can resolve
    const isAuthor = thread.author.toString() === req.user.userId;
    const isPrivileged = req.user.role === "FACULTY" || req.user.role === "ADMIN";
    if (!isAuthor && !isPrivileged)
      return res.status(403).json({ message: "Only the thread author or faculty/admin can resolve this" });

    thread.isResolved = true;
    thread.resolvedBy = req.user.userId;
    await thread.save();

    const populated = await thread.populate("resolvedBy", "email role");
    res.json({ message: "Thread marked as resolved", thread: populated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// PUT /api/reply/:replyId/accept — accept a reply (thread author only)
exports.acceptReply = async (req, res) => {
  try {
    const reply = await DiscussionReply.findById(req.params.replyId);
    if (!reply) return res.status(404).json({ message: "Reply not found" });

    const thread = await DiscussionThread.findById(reply.threadId);
    if (!thread) return res.status(404).json({ message: "Thread not found" });

    if (thread.author.toString() !== req.user.userId)
      return res.status(403).json({ message: "Only the thread author can accept a reply" });

    // Unaccept any previously accepted reply for this thread
    await DiscussionReply.updateMany(
      { threadId: reply.threadId, _id: { $ne: reply._id } },
      { $set: { isAccepted: false } }
    );

    reply.isAccepted = true;
    await reply.save();

    const populated = await reply.populate("author", "email role");
    res.json({ message: "Reply accepted", reply: populated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};