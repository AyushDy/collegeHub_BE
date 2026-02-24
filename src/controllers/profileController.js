const StudentProfile = require("../models/StudentProfile");
const AcademicGroup = require("../models/AcademicGroup");
const GroupMembership = require("../models/GroupMembership");
const User = require("../models/User");

// POST /api/profile — create profile (student only, once)
exports.createProfile = async (req, res) => {
  try {
    const existing = await StudentProfile.findOne({ userId: req.user.userId });
    if (existing)
      return res.status(400).json({ message: "Profile already exists" });

    const { branch, year, section, rollNumber, skills, interests, resumeLink, portfolioLink } = req.body;

    // Auto-create YEAR group (e.g. CSE-2) and YEAR_SECTION group (e.g. CSE-2-A)
    const B = branch.toUpperCase();
    const S = section.toUpperCase();

    const [yearGroup, sectionGroup] = await Promise.all([
      AcademicGroup.findOneAndUpdate(
        { branch: B, year, type: "YEAR" },
        { $setOnInsert: { branch: B, year, type: "YEAR", name: `${B}-${year}` } },
        { upsert: true, new: true }
      ),
      AcademicGroup.findOneAndUpdate(
        { branch: B, year, section: S, type: "YEAR_SECTION" },
        { $setOnInsert: { branch: B, year, section: S, type: "YEAR_SECTION", name: `${B}-${year}-${S}` } },
        { upsert: true, new: true }
      ),
    ]);

    // Enroll student in both groups (upsert — safe to call again)
    await Promise.all([
      GroupMembership.updateOne(
        { userId: req.user.userId, groupId: yearGroup._id },
        { $setOnInsert: { userId: req.user.userId, groupId: yearGroup._id, isSystemGenerated: true } },
        { upsert: true }
      ),
      GroupMembership.updateOne(
        { userId: req.user.userId, groupId: sectionGroup._id },
        { $setOnInsert: { userId: req.user.userId, groupId: sectionGroup._id, isSystemGenerated: true } },
        { upsert: true }
      ),
    ]);

    const profile = await StudentProfile.create({
      userId: req.user.userId,
      branch,
      year,
      section,
      rollNumber,
      skills,
      interests,
      resumeLink,
      portfolioLink,
    });

    res.status(201).json({ message: "Profile created", profile });
  } catch (error) {
    if (error.name === "ValidationError")
      return res.status(400).json({ error: error.message });
    res.status(500).json({ error: error.message });
  }
};

// GET /api/profile/me — get own profile (student)
exports.getMyProfile = async (req, res) => {
  try {
    const profile = await StudentProfile.findOne({ userId: req.user.userId }).populate(
      "userId",
      "name email role profilePicture"
    );

    if (!profile)
      return res.status(404).json({ message: "Profile not found. Please create one." });

    res.json({ profile });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// PUT /api/profile — update own profile (student, ownership enforced)
exports.updateProfile = async (req, res) => {
  try {
    const ALLOWED_FIELDS = [
      "branch", "year", "section", "rollNumber",
      "skills", "interests", "resumeLink", "portfolioLink",
    ];

    const updates = {};
    for (const key of ALLOWED_FIELDS) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const profile = await StudentProfile.findOneAndUpdate(
      { userId: req.user.userId },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!profile)
      return res.status(404).json({ message: "Profile not found" });

    res.json({ message: "Profile updated", profile });
  } catch (error) {
    if (error.name === "ValidationError")
      return res.status(400).json({ error: error.message });
    res.status(500).json({ error: error.message });
  }
};

// GET /api/profile/view/:id — view any student profile (faculty/admin)
exports.viewProfile = async (req, res) => {
  try {
    const profile = await StudentProfile.findById(req.params.id).populate(
      "userId",
      "name email role profilePicture"
    );

    if (!profile)
      return res.status(404).json({ message: "Profile not found" });

    res.json({ profile });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// PUT /api/profile/me/user — update own name and/or profile picture (all roles)
exports.updateUserInfo = async (req, res) => {
  try {
    const updates = {};

    if (req.body.name !== undefined) {
      const trimmed = req.body.name.trim();
      if (trimmed.length > 100)
        return res.status(400).json({ message: "Name must be 100 characters or fewer" });
      updates.name = trimmed || null;
    }

    // If an image was uploaded via multer-cloudinary, req.file.path holds the URL
    if (req.file) {
      updates.profilePicture = req.file.path;
    }

    if (Object.keys(updates).length === 0)
      return res.status(400).json({ message: "No updatable fields provided" });

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { $set: updates },
      { new: true, runValidators: true }
    ).select("name email role profilePicture");

    res.json({ message: "User info updated", user });
  } catch (error) {
    if (error.name === "ValidationError")
      return res.status(400).json({ error: error.message });
    res.status(500).json({ error: error.message });
  }
};

// GET /api/profile/filter?year=&section=&branch= — filter profiles (faculty/admin)
exports.filterProfiles = async (req, res) => {
  try {
    const { year, section, branch } = req.query;
    const filter = { isActive: true };

    if (year) filter.year = Number(year);
    if (section) filter.section = { $regex: section, $options: "i" };
    if (branch) filter.branch = { $regex: branch, $options: "i" };

    const profiles = await StudentProfile.find(filter)
      .populate("userId", "email role")
      .sort({ year: 1, section: 1, rollNumber: 1 });

    res.json({ count: profiles.length, profiles });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─── GET /api/profile/export/csv ────────────────────────────────────────────
// Faculty/Admin: download student data as CSV
// Query params: branch, year, section, hasResume (true/false), groupId
exports.exportStudentsCsv = async (req, res) => {
  try {
    const { branch, year, section, hasResume, groupId } = req.query;

    const filter = { isActive: true };

    if (branch) filter.branch = { $regex: branch, $options: "i" };
    if (year) filter.year = Number(year);
    if (section) filter.section = { $regex: section, $options: "i" };
    if (hasResume === "true") filter.resumeLink = { $ne: null, $exists: true };
    if (hasResume === "false") filter.$or = [{ resumeLink: null }, { resumeLink: { $exists: false } }];

    // If groupId provided, restrict to members of that group
    if (groupId) {
      const memberships = await GroupMembership.find({ groupId }).select("userId").lean();
      const userIds = memberships.map((m) => m.userId);
      filter.userId = { $in: userIds };
    }

    const profiles = await StudentProfile.find(filter)
      .populate("userId", "name email")
      .sort({ year: 1, section: 1, rollNumber: 1 })
      .lean();

    // ── Build CSV ──────────────────────────────────────────────────────────
    const escape = (val) => {
      if (val === null || val === undefined) return "";
      const str = String(val);
      // Wrap in quotes if value contains comma, quote, or newline
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };

    const headers = [
      "name", "email", "rollNumber", "branch", "year", "section",
      "skills", "interests", "resumeLink", "portfolioLink",
    ];

    const rows = profiles.map((p) => [
      escape(p.userId?.name),
      escape(p.userId?.email),
      escape(p.rollNumber),
      escape(p.branch),
      escape(p.year),
      escape(p.section),
      escape((p.skills || []).join("; ")),
      escape((p.interests || []).join("; ")),
      escape(p.resumeLink),
      escape(p.portfolioLink),
    ].join(","));

    const csv = [headers.join(","), ...rows].join("\r\n");

    const filename = `students_${Date.now()}.csv`;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
