const StudentProfile = require("../models/StudentProfile");
const AcademicGroup = require("../models/AcademicGroup");
const GroupMembership = require("../models/GroupMembership");

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
      "email role"
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
      "email role"
    );

    if (!profile)
      return res.status(404).json({ message: "Profile not found" });

    res.json({ profile });
  } catch (error) {
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
