const ForumThread = require("../models/ForumThread");
const ForumReply = require("../models/ForumMessage"); // model file kept, exports ForumReply

// ─── POST /api/forums ────────────────────────────────────────────────────────
exports.createForum = async (req, res) => {
  try {
    const { title, description, topic, tags } = req.body;

    if (!title || !title.trim())
      return res.status(400).json({ message: "Title is required" });

    const forum = await ForumThread.create({
      title: title.trim(),
      description: description?.trim() || "",
      topic: topic?.trim() || "General",
      tags: tags
        ? (Array.isArray(tags) ? tags : tags.split(","))
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
      createdBy: req.user.userId,
    });

    const populated = await forum.populate("createdBy", "name email role");
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ─── GET /api/forums ─────────────────────────────────────────────────────────
// Paginated, filterable: topic, search, mine
exports.listForums = async (req, res) => {
  try {
    const { topic, search, mine, page = 1, limit = 20 } = req.query;

    const filter = { isActive: true };
    if (topic) filter.topic = { $regex: topic, $options: "i" };
    if (search) filter.$text = { $search: search };
    if (mine === "true") filter.createdBy = req.user.userId;

    const skip = (Math.max(Number(page), 1) - 1) * Math.min(Number(limit), 50);
    const lim = Math.min(Number(limit) || 20, 50);

    const [forums, total] = await Promise.all([
      ForumThread.find(filter)
        .populate("createdBy", "name email role")
        .sort({ lastActivity: -1 })
        .skip(skip)
        .limit(lim)
        .lean()
        .then((docs) =>
          docs.map((d) => ({
            ...d,
            likesCount: d.likes?.length || 0,
            dislikesCount: d.dislikes?.length || 0,
            likes: undefined,
            dislikes: undefined,
          }))
        ),
      ForumThread.countDocuments(filter),
    ]);

    res.json({
      forums,
      page: Math.max(Number(page), 1),
      pages: Math.ceil(total / lim) || 1,
      total,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ─── GET /api/forums/:forumId ────────────────────────────────────────────────
exports.getForum = async (req, res) => {
  try {
    const forum = await ForumThread.findById(req.params.forumId)
      .populate("createdBy", "name email role")
      .lean();

    if (!forum || !forum.isActive)
      return res.status(404).json({ message: "Forum not found" });

    forum.likesCount = forum.likes?.length || 0;
    forum.dislikesCount = forum.dislikes?.length || 0;
    forum.userLiked = forum.likes?.some((id) => id.toString() === req.user.userId) || false;
    forum.userDisliked = forum.dislikes?.some((id) => id.toString() === req.user.userId) || false;
    delete forum.likes;
    delete forum.dislikes;

    res.json(forum);
  } catch (err) {
    if (err.name === "CastError")
      return res.status(400).json({ message: "Invalid forumId" });
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ─── GET /api/forums/:forumId/replies ────────────────────────────────────────
exports.getReplies = async (req, res) => {
  try {
    const forum = await ForumThread.findById(req.params.forumId);
    if (!forum || !forum.isActive)
      return res.status(404).json({ message: "Forum not found" });

    const { page = 1, limit = 50 } = req.query;
    const skip = (Math.max(Number(page), 1) - 1) * Math.min(Number(limit), 100);
    const lim = Math.min(Number(limit) || 50, 100);

    const uid = req.user.userId;

    const [replies, total] = await Promise.all([
      ForumReply.find({ forumId: req.params.forumId })
        .populate("author", "name email role")
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(lim)
        .lean()
        .then((docs) =>
          docs.map((r) => ({
            ...r,
            likesCount: r.likes?.length || 0,
            dislikesCount: r.dislikes?.length || 0,
            userLiked: r.likes?.some((id) => id.toString() === uid) || false,
            userDisliked: r.dislikes?.some((id) => id.toString() === uid) || false,
            likes: undefined,
            dislikes: undefined,
          }))
        ),
      ForumReply.countDocuments({ forumId: req.params.forumId }),
    ]);

    res.json({
      replies,
      page: Math.max(Number(page), 1),
      pages: Math.ceil(total / lim) || 1,
      total,
    });
  } catch (err) {
    if (err.name === "CastError")
      return res.status(400).json({ message: "Invalid forumId" });
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ─── POST /api/forums/:forumId/replies ───────────────────────────────────────
exports.addReply = async (req, res) => {
  try {
    const forum = await ForumThread.findById(req.params.forumId);
    if (!forum || !forum.isActive)
      return res.status(404).json({ message: "Forum not found" });

    const { content } = req.body;
    if (!content || !content.trim())
      return res.status(400).json({ message: "Content is required" });

    const reply = await ForumReply.create({
      forumId: req.params.forumId,
      author: req.user.userId,
      content: content.trim(),
    });

    forum.replyCount += 1;
    forum.lastActivity = new Date();
    await forum.save();

    const populated = await reply.populate("author", "name email role");
    const obj = populated.toObject();
    obj.likesCount = 0;
    obj.dislikesCount = 0;
    obj.userLiked = false;
    obj.userDisliked = false;
    delete obj.likes;
    delete obj.dislikes;

    res.status(201).json(obj);
  } catch (err) {
    if (err.name === "CastError")
      return res.status(400).json({ message: "Invalid forumId" });
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ─── PUT /api/forums/replies/:replyId ────────────────────────────────────────
exports.editReply = async (req, res) => {
  try {
    const reply = await ForumReply.findById(req.params.replyId);
    if (!reply) return res.status(404).json({ message: "Reply not found" });

    if (reply.author.toString() !== req.user.userId)
      return res.status(403).json({ message: "You can only edit your own replies" });

    const { content } = req.body;
    if (!content || !content.trim())
      return res.status(400).json({ message: "Content is required" });

    reply.content = content.trim();
    reply.isEdited = true;
    await reply.save();

    const populated = await reply.populate("author", "name email role");
    res.json(populated);
  } catch (err) {
    if (err.name === "CastError")
      return res.status(400).json({ message: "Invalid replyId" });
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ─── DELETE /api/forums/replies/:replyId ─────────────────────────────────────
exports.deleteReply = async (req, res) => {
  try {
    const reply = await ForumReply.findById(req.params.replyId);
    if (!reply) return res.status(404).json({ message: "Reply not found" });

    const isOwner = reply.author.toString() === req.user.userId;
    const isMod = ["FACULTY", "ADMIN"].includes(req.user.role);
    if (!isOwner && !isMod)
      return res.status(403).json({ message: "Not allowed" });

    const forumId = reply.forumId;
    await reply.deleteOne();
    await ForumThread.findByIdAndUpdate(forumId, { $inc: { replyCount: -1 } });

    res.json({ message: "Reply deleted" });
  } catch (err) {
    if (err.name === "CastError")
      return res.status(400).json({ message: "Invalid replyId" });
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ─── PATCH /api/forums/:forumId/like ─────────────────────────────────────────
// Toggle like on thread (removes dislike if present)
exports.likeForum = async (req, res) => {
  try {
    const forum = await ForumThread.findById(req.params.forumId);
    if (!forum || !forum.isActive)
      return res.status(404).json({ message: "Forum not found" });

    const uid = req.user.userId;
    const alreadyLiked = forum.likes.some((id) => id.toString() === uid);

    if (alreadyLiked) {
      forum.likes.pull(uid);
    } else {
      forum.dislikes.pull(uid);
      forum.likes.addToSet(uid);
    }
    await forum.save();

    res.json({
      likesCount: forum.likes.length,
      dislikesCount: forum.dislikes.length,
      userLiked: !alreadyLiked,
      userDisliked: false,
    });
  } catch (err) {
    if (err.name === "CastError")
      return res.status(400).json({ message: "Invalid forumId" });
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ─── PATCH /api/forums/:forumId/dislike ──────────────────────────────────────
exports.dislikeForum = async (req, res) => {
  try {
    const forum = await ForumThread.findById(req.params.forumId);
    if (!forum || !forum.isActive)
      return res.status(404).json({ message: "Forum not found" });

    const uid = req.user.userId;
    const alreadyDisliked = forum.dislikes.some((id) => id.toString() === uid);

    if (alreadyDisliked) {
      forum.dislikes.pull(uid);
    } else {
      forum.likes.pull(uid);
      forum.dislikes.addToSet(uid);
    }
    await forum.save();

    res.json({
      likesCount: forum.likes.length,
      dislikesCount: forum.dislikes.length,
      userLiked: false,
      userDisliked: !alreadyDisliked,
    });
  } catch (err) {
    if (err.name === "CastError")
      return res.status(400).json({ message: "Invalid forumId" });
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ─── PATCH /api/forums/replies/:replyId/like ─────────────────────────────────
exports.likeReply = async (req, res) => {
  try {
    const reply = await ForumReply.findById(req.params.replyId);
    if (!reply) return res.status(404).json({ message: "Reply not found" });

    const uid = req.user.userId;
    const alreadyLiked = reply.likes.some((id) => id.toString() === uid);

    if (alreadyLiked) {
      reply.likes.pull(uid);
    } else {
      reply.dislikes.pull(uid);
      reply.likes.addToSet(uid);
    }
    await reply.save();

    res.json({
      likesCount: reply.likes.length,
      dislikesCount: reply.dislikes.length,
      userLiked: !alreadyLiked,
      userDisliked: false,
    });
  } catch (err) {
    if (err.name === "CastError")
      return res.status(400).json({ message: "Invalid replyId" });
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ─── PATCH /api/forums/replies/:replyId/dislike ──────────────────────────────
exports.dislikeReply = async (req, res) => {
  try {
    const reply = await ForumReply.findById(req.params.replyId);
    if (!reply) return res.status(404).json({ message: "Reply not found" });

    const uid = req.user.userId;
    const alreadyDisliked = reply.dislikes.some((id) => id.toString() === uid);

    if (alreadyDisliked) {
      reply.dislikes.pull(uid);
    } else {
      reply.likes.pull(uid);
      reply.dislikes.addToSet(uid);
    }
    await reply.save();

    res.json({
      likesCount: reply.likes.length,
      dislikesCount: reply.dislikes.length,
      userLiked: false,
      userDisliked: !alreadyDisliked,
    });
  } catch (err) {
    if (err.name === "CastError")
      return res.status(400).json({ message: "Invalid replyId" });
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ─── DELETE /api/forums/:forumId ─────────────────────────────────────────────
exports.deleteForum = async (req, res) => {
  try {
    const forum = await ForumThread.findById(req.params.forumId);
    if (!forum || !forum.isActive)
      return res.status(404).json({ message: "Forum not found" });

    const isOwner = forum.createdBy.toString() === req.user.userId;
    const isMod = ["FACULTY", "ADMIN"].includes(req.user.role);
    if (!isOwner && !isMod)
      return res.status(403).json({ message: "Not allowed" });

    forum.isActive = false;
    await forum.save();

    res.json({ message: "Forum deleted" });
  } catch (err) {
    if (err.name === "CastError")
      return res.status(400).json({ message: "Invalid forumId" });
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
