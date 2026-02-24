const Notification = require("../models/Notification");

// ─── GET /api/notifications ───────────────────────────────────────────────────
// Fetch all notifications for the current user, unread first
exports.getMyNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20, unreadOnly } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));

    const filter = { targetUserId: req.user.userId };
    if (unreadOnly === "true") filter.isRead = false;

    const [notifications, total] = await Promise.all([
      Notification.find(filter)
        .sort({ isRead: 1, createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .populate("payload.quizId", "title status groupId")
        .populate("payload.createdBy", "email role")
        .lean(),
      Notification.countDocuments(filter),
    ]);

    res.json({
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      notifications,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─── PATCH /api/notifications/:notificationId/read ───────────────────────────
// Mark a single notification as read
exports.markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.notificationId);
    if (!notification) return res.status(404).json({ message: "Notification not found." });

    // Ensure the notification belongs to the requesting user
    if (notification.targetUserId.toString() !== req.user.userId)
      return res.status(403).json({ message: "Access denied." });

    if (notification.isRead)
      return res.json({ message: "Already marked as read.", notification });

    notification.isRead = true;
    await notification.save();

    res.json({ message: "Notification marked as read.", notification });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─── PATCH /api/notifications/read-all ───────────────────────────────────────
// Mark ALL unread notifications for current user as read
exports.markAllAsRead = async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { targetUserId: req.user.userId, isRead: false },
      { $set: { isRead: true } }
    );

    res.json({ message: "All notifications marked as read.", updated: result.modifiedCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─── GET /api/notifications/unread-count ─────────────────────────────────────
// Quick unread badge count
exports.getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      targetUserId: req.user.userId,
      isRead: false,
    });
    res.json({ unreadCount: count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
