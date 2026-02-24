const Event = require("../models/Event");
const AcademicGroup = require("../models/AcademicGroup");
const Club = require("../models/Club");
const Notification = require("../models/Notification");
const GroupMembership = require("../models/GroupMembership");
const ClubMembership = require("../models/ClubMembership");
const User = require("../models/User");
const cloudinary = require("../config/cloudinary");
const { isClubLeader } = require("../utils/clubMembership");

// ─── Helper: fan-out event notifications ─────────────────────────────────────
const notifyEvent = async (event) => {
  let targetUserIds = [];

  if (event.type === "COLLEGE") {
    // Notify ALL users
    const users = await User.find({}, "_id").lean();
    targetUserIds = users.map((u) => u._id);
  } else if (event.type === "GROUP" && event.groupId) {
    // Notify all members of the academic group
    const memberships = await GroupMembership.find({ groupId: event.groupId }).lean();
    targetUserIds = memberships.map((m) => m.userId);
  } else if (event.type === "CLUB" && event.clubId) {
    // Notify all members of the club
    const memberships = await ClubMembership.find({ clubId: event.clubId }).lean();
    targetUserIds = memberships.map((m) => m.userId);
  }

  if (!targetUserIds.length) return;

  // Exclude the organizer from receiving their own notification
  const organizerId = event.organizer.toString();
  const filtered = targetUserIds.filter((id) => id.toString() !== organizerId);
  if (!filtered.length) return;

  const notifications = filtered.map((userId) => ({
    targetUserId: userId,
    targetGroupId: event.type === "GROUP" ? event.groupId : null,
    type: "EVENT",
    payload: {
      eventId: event._id,
      title: event.title,
      message: `New event: ${event.title}`,
      createdBy: event.organizer,
      eventDate: event.date,
      clubId: event.clubId || null,
    },
  }));

  await Notification.insertMany(notifications);
};

// ─── EVENT ENDPOINTS ─────────────────────────────────────────────────────────

// POST /api/events — create event (FACULTY / ADMIN only)
exports.createEvent = async (req, res) => {
  try {
    const { title, description, date, time, venue, type, groupId, tags } = req.body;

    if (!title || !date)
      return res.status(400).json({ message: "Title and date are required" });

    const eventType = (type || "COLLEGE").toUpperCase();
    if (!["COLLEGE", "GROUP", "CLUB"].includes(eventType))
      return res.status(400).json({ message: "Invalid event type" });

    // If GROUP type, validate the group exists
    if (eventType === "GROUP") {
      if (!groupId)
        return res.status(400).json({ message: "groupId is required for GROUP events" });
      const group = await AcademicGroup.findById(groupId);
      if (!group || !group.isActive)
        return res.status(404).json({ message: "Group not found" });
    }

    // If CLUB type, validate the club exists and caller is leader/admin
    const { clubId } = req.body;
    if (eventType === "CLUB") {
      if (!clubId)
        return res.status(400).json({ message: "clubId is required for CLUB events" });
      const club = await Club.findOne({ _id: clubId, isActive: true });
      if (!club)
        return res.status(404).json({ message: "Club not found" });
      const authorized = await isClubLeader(req.user.userId, req.user.role, clubId);
      if (!authorized)
        return res.status(403).json({ message: "Only club leaders or ADMIN can create club events" });
    }

    const event = await Event.create({
      title: title.trim(),
      description: description?.trim() || "",
      poster: req.file ? req.file.path : null,
      date,
      time: time?.trim() || null,
      venue: venue?.trim() || null,
      type: eventType,
      groupId: eventType === "GROUP" ? groupId : null,
      clubId: eventType === "CLUB" ? clubId : null,
      organizer: req.user.userId,
      tags: Array.isArray(tags) ? tags.map((t) => t.trim()) : [],
    });

    await event.populate("organizer", "email role name profilePicture");

    // Fire-and-forget notification fan-out
    notifyEvent(event).catch((err) =>
      console.error("Event notification error:", err.message)
    );

    res.status(201).json({ message: "Event created", event });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// GET /api/events — list events (paginated, filterable)
// Query params: page, limit, type, groupId, upcoming (true/false), search
exports.listEvents = async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const filter = { isActive: true };

    // Filter by type
    if (req.query.type) {
      const t = req.query.type.toUpperCase();
      if (["COLLEGE", "GROUP", "CLUB"].includes(t)) filter.type = t;
    }

    // Filter by group
    if (req.query.groupId) filter.groupId = req.query.groupId;

    // Filter by club
    if (req.query.clubId) filter.clubId = req.query.clubId;

    // Upcoming only
    if (req.query.upcoming === "true") {
      filter.date = { $gte: new Date() };
    }

    // Text search
    if (req.query.search) {
      filter.$text = { $search: req.query.search };
    }

    const [events, total] = await Promise.all([
      Event.find(filter)
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit)
        .populate("organizer", "email role name profilePicture")
        .populate("groupId", "name branch year section")
        .populate("clubId", "name logo category")
        .lean(),
      Event.countDocuments(filter),
    ]);

    // Attach counts
    const userId = req.user.userId.toString();
    const result = events.map((e) => ({
      ...e,
      rsvpCount: e.rsvps.length,
      userRsvpd: e.rsvps.some((id) => id.toString() === userId),
      rsvps: undefined, // hide full list
    }));

    res.json({
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      totalEvents: total,
      events: result,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// GET /api/events/:eventId — single event detail
exports.getEvent = async (req, res) => {
  try {
    const event = await Event.findOne({ _id: req.params.eventId, isActive: true })
      .populate("organizer", "email role name profilePicture")
      .populate("groupId", "name branch year section")
      .populate("clubId", "name logo category")
      .populate("rsvps", "email name profilePicture")
      .lean();

    if (!event) return res.status(404).json({ message: "Event not found" });

    const userId = req.user.userId.toString();
    event.rsvpCount = event.rsvps.length;
    event.userRsvpd = event.rsvps.some((u) => u._id.toString() === userId);

    res.json({ event });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// PATCH /api/events/:eventId — update event (organizer, ADMIN only)
exports.updateEvent = async (req, res) => {
  try {
    const event = await Event.findOne({ _id: req.params.eventId, isActive: true });
    if (!event) return res.status(404).json({ message: "Event not found" });

    // Only organizer or ADMIN can update
    if (
      event.organizer.toString() !== req.user.userId.toString() &&
      req.user.role !== "ADMIN"
    )
      return res.status(403).json({ message: "Not authorized to update this event" });

    const allowed = ["title", "description", "date", "time", "venue", "type", "groupId", "tags"];
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) {
        if (field === "tags" && Array.isArray(req.body.tags)) {
          event.tags = req.body.tags.map((t) => t.trim());
        } else if (field === "type") {
          event.type = req.body.type.toUpperCase();
        } else {
          event[field] = typeof req.body[field] === "string" ? req.body[field].trim() : req.body[field];
        }
      }
    });

    // Handle poster upload
    if (req.file) {
      // Delete old poster from Cloudinary if exists
      if (event.poster) {
        const publicId = event.poster.split("/").slice(-2).join("/").split(".")[0];
        await cloudinary.uploader.destroy(`collegehub/${publicId}`).catch(() => {});
      }
      event.poster = req.file.path;
    }

    await event.save();
    await event.populate("organizer", "email role name profilePicture");

    res.json({ message: "Event updated", event });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// PATCH /api/events/:eventId/rsvp — toggle RSVP (any authenticated user)
exports.toggleRsvp = async (req, res) => {
  try {
    const event = await Event.findOne({ _id: req.params.eventId, isActive: true });
    if (!event) return res.status(404).json({ message: "Event not found" });

    const userId = req.user.userId;
    const idx = event.rsvps.findIndex((id) => id.toString() === userId.toString());

    if (idx === -1) {
      event.rsvps.push(userId);
    } else {
      event.rsvps.splice(idx, 1);
    }

    await event.save();

    res.json({
      message: idx === -1 ? "RSVP added" : "RSVP removed",
      rsvpCount: event.rsvps.length,
      userRsvpd: idx === -1,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// DELETE /api/events/:eventId — soft-delete event (organizer / ADMIN)
exports.deleteEvent = async (req, res) => {
  try {
    const event = await Event.findOne({ _id: req.params.eventId, isActive: true });
    if (!event) return res.status(404).json({ message: "Event not found" });

    // Only organizer or ADMIN can delete
    if (
      event.organizer.toString() !== req.user.userId.toString() &&
      req.user.role !== "ADMIN"
    )
      return res.status(403).json({ message: "Not authorized to delete this event" });

    // Delete poster from Cloudinary if exists
    if (event.poster) {
      const publicId = event.poster.split("/").slice(-2).join("/").split(".")[0];
      await cloudinary.uploader.destroy(`collegehub/${publicId}`).catch(() => {});
    }

    event.isActive = false;
    await event.save();

    res.json({ message: "Event deleted" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
