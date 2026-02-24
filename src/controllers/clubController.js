const Club = require("../models/Club");
const ClubMembership = require("../models/ClubMembership");
const cloudinary = require("../config/cloudinary");
const { isClubLeader } = require("../utils/clubMembership");

// ─── CLUB ENDPOINTS ──────────────────────────────────────────────────────────

// POST /api/clubs — create club (FACULTY / ADMIN)
exports.createClub = async (req, res) => {
  try {
    const { name, description, category, tags } = req.body;

    if (!name || !name.trim())
      return res.status(400).json({ message: "Club name is required" });

    const existing = await Club.findOne({ name: name.trim().toUpperCase() === name.trim() ? name.trim() : { $regex: new RegExp(`^${name.trim()}$`, "i") } });
    if (existing)
      return res.status(409).json({ message: "A club with this name already exists" });

    const club = await Club.create({
      name: name.trim(),
      description: description?.trim() || "",
      logo: req.file ? req.file.path : null,
      category: category ? category.toUpperCase() : "OTHER",
      leader: req.user.userId,
      tags: Array.isArray(tags) ? tags.map((t) => t.trim()) : [],
    });

    // Auto-add creator as LEADER in membership
    await ClubMembership.create({
      userId: req.user.userId,
      clubId: club._id,
      role: "LEADER",
    });

    await club.populate("leader", "email role name profilePicture");

    res.status(201).json({ message: "Club created", club });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// GET /api/clubs — list clubs (paginated, filterable)
exports.listClubs = async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const filter = { isActive: true };

    if (req.query.category) {
      const cat = req.query.category.toUpperCase();
      if (["TECH", "CULTURAL", "SPORTS", "SOCIAL", "OTHER"].includes(cat))
        filter.category = cat;
    }

    if (req.query.search) {
      const re = { $regex: req.query.search, $options: "i" };
      filter.$or = [{ name: re }, { tags: re }, { description: re }];
    }

    const [clubs, total] = await Promise.all([
      Club.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("leader", "email role name profilePicture")
        .lean(),
      Club.countDocuments(filter),
    ]);

    // Attach memberCount + userJoined for each club
    const clubIds = clubs.map((c) => c._id);
    const [counts, userMemberships] = await Promise.all([
      ClubMembership.aggregate([
        { $match: { clubId: { $in: clubIds } } },
        { $group: { _id: "$clubId", count: { $sum: 1 } } },
      ]),
      req.user
        ? ClubMembership.find({ userId: req.user.userId, clubId: { $in: clubIds } }).lean()
        : [],
    ]);

    const countMap = {};
    counts.forEach((c) => (countMap[c._id.toString()] = c.count));
    const joinedSet = new Set(userMemberships.map((m) => m.clubId.toString()));

    const result = clubs.map((c) => ({
      ...c,
      memberCount: countMap[c._id.toString()] || 0,
      userJoined: joinedSet.has(c._id.toString()),
    }));

    res.json({
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      totalClubs: total,
      clubs: result,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// GET /api/clubs/:clubId — club detail
exports.getClub = async (req, res) => {
  try {
    const club = await Club.findOne({ _id: req.params.clubId, isActive: true })
      .populate("leader", "email role name profilePicture")
      .lean();

    if (!club) return res.status(404).json({ message: "Club not found" });

    const [memberCount, membership] = await Promise.all([
      ClubMembership.countDocuments({ clubId: club._id }),
      req.user ? ClubMembership.findOne({ userId: req.user.userId, clubId: club._id }).lean() : null,
    ]);

    club.memberCount = memberCount;
    club.userJoined = !!membership;
    club.userRole = membership ? membership.role : null;

    res.json({ club });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// PATCH /api/clubs/:clubId — update club (leader / ADMIN)
exports.updateClub = async (req, res) => {
  try {
    const club = await Club.findOne({ _id: req.params.clubId, isActive: true });
    if (!club) return res.status(404).json({ message: "Club not found" });

    const authorized = await isClubLeader(req.user.userId, req.user.role, club._id);
    if (!authorized)
      return res.status(403).json({ message: "Not authorized to update this club" });

    const allowed = ["name", "description", "category", "tags"];
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) {
        if (field === "tags" && Array.isArray(req.body.tags)) {
          club.tags = req.body.tags.map((t) => t.trim());
        } else if (field === "category") {
          club.category = req.body.category.toUpperCase();
        } else {
          club[field] = typeof req.body[field] === "string" ? req.body[field].trim() : req.body[field];
        }
      }
    });

    // Handle logo upload
    if (req.file) {
      if (club.logo) {
        const publicId = club.logo.split("/").slice(-2).join("/").split(".")[0];
        await cloudinary.uploader.destroy(`collegehub/${publicId}`).catch(() => {});
      }
      club.logo = req.file.path;
    }

    await club.save();
    await club.populate("leader", "email role name profilePicture");

    res.json({ message: "Club updated", club });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// DELETE /api/clubs/:clubId — soft-delete club (leader / ADMIN)
exports.deleteClub = async (req, res) => {
  try {
    const club = await Club.findOne({ _id: req.params.clubId, isActive: true });
    if (!club) return res.status(404).json({ message: "Club not found" });

    const authorized = await isClubLeader(req.user.userId, req.user.role, club._id);
    if (!authorized)
      return res.status(403).json({ message: "Not authorized to delete this club" });

    if (club.logo) {
      const publicId = club.logo.split("/").slice(-2).join("/").split(".")[0];
      await cloudinary.uploader.destroy(`collegehub/${publicId}`).catch(() => {});
    }

    club.isActive = false;
    await club.save();

    res.json({ message: "Club deleted" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// POST /api/clubs/:clubId/join — student self-join
exports.joinClub = async (req, res) => {
  try {
    const club = await Club.findOne({ _id: req.params.clubId, isActive: true });
    if (!club) return res.status(404).json({ message: "Club not found" });

    const existing = await ClubMembership.findOne({ userId: req.user.userId, clubId: club._id });
    if (existing)
      return res.status(409).json({ message: "You are already a member of this club" });

    await ClubMembership.create({
      userId: req.user.userId,
      clubId: club._id,
      role: "MEMBER",
    });

    const memberCount = await ClubMembership.countDocuments({ clubId: club._id });

    res.status(201).json({ message: "Joined club", memberCount });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// POST /api/clubs/:clubId/leave — student leave (leader cannot leave)
exports.leaveClub = async (req, res) => {
  try {
    const membership = await ClubMembership.findOne({ userId: req.user.userId, clubId: req.params.clubId });
    if (!membership)
      return res.status(404).json({ message: "You are not a member of this club" });

    if (membership.role === "LEADER")
      return res.status(400).json({ message: "Leaders cannot leave. Transfer leadership first." });

    await membership.deleteOne();

    const memberCount = await ClubMembership.countDocuments({ clubId: req.params.clubId });

    res.json({ message: "Left club", memberCount });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// GET /api/clubs/:clubId/members — paginated member list
exports.getMembers = async (req, res) => {
  try {
    const club = await Club.findOne({ _id: req.params.clubId, isActive: true });
    if (!club) return res.status(404).json({ message: "Club not found" });

    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
    const skip = (page - 1) * limit;

    const [members, total] = await Promise.all([
      ClubMembership.find({ clubId: club._id })
        .sort({ role: 1, createdAt: 1 })
        .skip(skip)
        .limit(limit)
        .populate("userId", "email name profilePicture role")
        .lean(),
      ClubMembership.countDocuments({ clubId: club._id }),
    ]);

    res.json({
      page,
      limit,
      totalMembers: total,
      members: members.map((m) => ({
        user: m.userId,
        clubRole: m.role,
        joinedAt: m.createdAt,
      })),
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// PATCH /api/clubs/:clubId/members/:userId — promote / demote member
exports.promoteMember = async (req, res) => {
  try {
    const { clubId, userId } = req.params;
    const { role } = req.body; // "CO_LEADER" or "MEMBER"

    if (!role || !["CO_LEADER", "MEMBER"].includes(role))
      return res.status(400).json({ message: "role must be CO_LEADER or MEMBER" });

    const authorized = await isClubLeader(req.user.userId, req.user.role, clubId);
    if (!authorized)
      return res.status(403).json({ message: "Not authorized" });

    const membership = await ClubMembership.findOne({ userId, clubId });
    if (!membership)
      return res.status(404).json({ message: "Member not found" });

    if (membership.role === "LEADER")
      return res.status(400).json({ message: "Cannot change leader role. Use transfer instead." });

    membership.role = role;
    await membership.save();

    res.json({ message: `Member role updated to ${role}` });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// DELETE /api/clubs/:clubId/members/:userId — kick member
exports.kickMember = async (req, res) => {
  try {
    const { clubId, userId } = req.params;

    const authorized = await isClubLeader(req.user.userId, req.user.role, clubId);
    if (!authorized)
      return res.status(403).json({ message: "Not authorized" });

    const membership = await ClubMembership.findOne({ userId, clubId });
    if (!membership)
      return res.status(404).json({ message: "Member not found" });

    if (membership.role === "LEADER")
      return res.status(400).json({ message: "Cannot kick the leader" });

    await membership.deleteOne();

    res.json({ message: "Member removed" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// PATCH /api/clubs/:clubId/transfer — transfer leadership
exports.transferLeadership = async (req, res) => {
  try {
    const { clubId } = req.params;
    const { newLeaderId } = req.body;

    if (!newLeaderId)
      return res.status(400).json({ message: "newLeaderId is required" });

    // Only current LEADER or ADMIN
    const currentMembership = await ClubMembership.findOne({ userId: req.user.userId, clubId });
    const isAdmin = req.user.role === "ADMIN";

    if (!isAdmin && (!currentMembership || currentMembership.role !== "LEADER"))
      return res.status(403).json({ message: "Only the leader or ADMIN can transfer leadership" });

    const newLeaderMembership = await ClubMembership.findOne({ userId: newLeaderId, clubId });
    if (!newLeaderMembership)
      return res.status(404).json({ message: "New leader must be a member of the club" });

    // Promote new leader
    newLeaderMembership.role = "LEADER";
    await newLeaderMembership.save();

    // Demote old leader to MEMBER (if they exist as member)
    if (currentMembership && currentMembership.role === "LEADER") {
      currentMembership.role = "MEMBER";
      await currentMembership.save();
    }

    // Update Club.leader field
    await Club.findByIdAndUpdate(clubId, { leader: newLeaderId });

    res.json({ message: "Leadership transferred" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
