const express = require("express");
const router = express.Router();
const eventController = require("../controllers/eventController");
const { protect, authorize } = require("../middleware/authMiddleware");
const uploadImage = require("../middleware/uploadImage");

// Create event — FACULTY / ADMIN (poster upload optional)
router.post(
  "/",
  protect,
  authorize("FACULTY", "ADMIN"),
  uploadImage("event_posters").single("poster"),
  eventController.createEvent
);

// List events (paginated, filterable) — any authenticated user
router.get("/", protect, eventController.listEvents);

// Single event detail — any authenticated user
router.get("/:eventId", protect, eventController.getEvent);

// Update event — organizer or ADMIN (poster upload optional)
router.patch(
  "/:eventId",
  protect,
  authorize("FACULTY", "ADMIN"),
  uploadImage("event_posters").single("poster"),
  eventController.updateEvent
);

// Toggle RSVP — any authenticated user
router.patch("/:eventId/rsvp", protect, eventController.toggleRsvp);

// Delete event — organizer or ADMIN
router.delete("/:eventId", protect, authorize("FACULTY", "ADMIN"), eventController.deleteEvent);

module.exports = router;
