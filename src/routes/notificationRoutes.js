const express = require("express");
const router = express.Router();
const notificationController = require("../controllers/notificationController");
const { protect, authorize } = require("../middleware/authMiddleware");

const allRoles = authorize("STUDENT", "FACULTY", "ADMIN");

// GET  /api/notifications                          — paginated list
router.get("/", protect, allRoles, notificationController.getMyNotifications);

// GET  /api/notifications/unread-count             — badge count
router.get("/unread-count", protect, allRoles, notificationController.getUnreadCount);

// PATCH /api/notifications/read-all               — mark everything read
router.patch("/read-all", protect, allRoles, notificationController.markAllAsRead);

// PATCH /api/notifications/:notificationId/read   — mark single as read
router.patch("/:notificationId/read", protect, allRoles, notificationController.markAsRead);

module.exports = router;
