const AcademicGroup = require("../models/AcademicGroup");
const StudentProfile = require("../models/StudentProfile");
const GroupChatMessage = require("../models/GroupChatMessage");
const GroupMembership = require("../models/GroupMembership");
const { getStudentGroups, isMember } = require("../utils/groupMembership");

// ─── GROUP ENDPOINTS ─────────────────────────────────────────────────────────

// GET /api/groups/my — groups for the current user
// Students: groups they belong to via GroupMembership
// Faculty / Admin: all active groups (they are not stored in GroupMembership)
exports.getMyGroup = async (req, res) => {
  try {
    let groups;

    if (req.user.role === "FACULTY" || req.user.role === "ADMIN") {
      groups = await AcademicGroup.find({ isActive: true }).sort({ branch: 1, year: 1, section: 1 });
    } else {
      groups = await getStudentGroups(req.user.userId);
    }

    if (!groups.length)
      return res.status(404).json({ message: "No groups found. Create a profile first." });

    const result = groups.map((g) => ({
      _id: g._id,
      name: g.name,
      type: g.type,
      branch: g.branch,
      year: g.year,
      section: g.section || null,
      isActive: g.isActive,
      socketRoom: g._id.toString(), // client calls socket.emit("joinGroup", { groupId: socketRoom })
    }));

    res.json({ groups: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/groups — list all groups with optional filters (admin/faculty)
exports.listGroups = async (req, res) => {
  try {
    const { branch, year, section, type, search } = req.query;
    const filter = { isActive: true };
    if (branch) filter.branch = { $regex: branch, $options: "i" };
    if (year) filter.year = Number(year);
    if (section) filter.section = { $regex: section, $options: "i" };
    if (type) filter.type = type.toUpperCase();
    if (search) {
      const re = { $regex: search, $options: "i" };
      filter.$or = [{ name: re }, { branch: re }];
    }

    const groups = await AcademicGroup.find(filter).sort({ branch: 1, year: 1, section: 1 });
    res.json({ count: groups.length, groups });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/groups/:groupId/members — students in a group (admin/faculty)
exports.getGroupMembers = async (req, res) => {
  try {
    const group = await AcademicGroup.findById(req.params.groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    const members = await StudentProfile.find({
      branch: group.branch,
      year: group.year,
      section: group.section,
      isActive: true,
    }).populate("userId", "email role");

    res.json({ groupName: group.name, count: members.length, members });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/groups/:groupId/open — open a specific group (must be member)
exports.openGroup = async (req, res) => {
  try {
    const group = await AcademicGroup.findById(req.params.groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    const member = await isMember(req.user.userId, req.user.role, req.params.groupId);
    if (!member)
      return res.status(403).json({ message: "You are not a member of this group" });

    res.json({
      group: {
        _id: group._id,
        name: group.name,
        type: group.type,
        branch: group.branch,
        year: group.year,
        section: group.section || null,
        isActive: group.isActive,
        socketRoom: group._id.toString(),
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─── REST CHAT ENDPOINTS ──────────────────────────────────────────────────────

// POST /api/groups/:groupId/chat — send message (student, must belong to group)
exports.sendMessage = async (req, res) => {
  try {
    const group = await AcademicGroup.findById(req.params.groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    // Verify student membership via GroupMembership
    const member = await isMember(req.user.userId, req.user.role, req.params.groupId);
    if (!member)
      return res.status(403).json({ message: "You are not a member of this group" });

    const { message } = req.body;
    if (!message || !message.trim())
      return res.status(400).json({ message: "Message cannot be empty" });

    const newMsg = await GroupChatMessage.create({
      groupId: req.params.groupId,
      sender: req.user.userId,
      message: message.trim(),
    });

    const populated = await newMsg.populate("sender", "email role");
    res.status(201).json({ message: "Message sent", data: populated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/groups/:groupId/chat — get paginated messages
exports.getMessages = async (req, res) => {
  try {
    const group = await AcademicGroup.findById(req.params.groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    // Students must belong to the group; faculty/admin can view any
    if (req.user.role === "STUDENT") {
      const member = await isMember(req.user.userId, req.user.role, req.params.groupId);
      if (!member)
        return res.status(403).json({ message: "You are not a member of this group" });
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      GroupChatMessage.find({ groupId: req.params.groupId })
        .populate("sender", "email role")
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limit),
      GroupChatMessage.countDocuments({ groupId: req.params.groupId }),
    ]);

    res.json({ total, page, limit, messages });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
