const path = require("path");
const fs = require("fs");
const AcademicResource = require("../models/AcademicResource");
const AcademicGroup = require("../models/AcademicGroup");
const { isMember } = require("../utils/groupMembership");

const VALID_TYPES = ["SYLLABUS", "PYQ", "LECTURE_NOTE"];

// ─── POST /api/resources/upload ──────────────────────────────────────────────
exports.upload = async (req, res) => {
  try {
    const { type, groupId, title, description, subject, examYear, tags } =
      req.body;

    // Validate required fields
    if (!type || !VALID_TYPES.includes(type))
      return res
        .status(400)
        .json({ message: `type must be one of: ${VALID_TYPES.join(", ")}` });
    if (!groupId) return res.status(400).json({ message: "groupId required" });
    if (!title || !title.trim())
      return res.status(400).json({ message: "title required" });

    // Verify group exists
    const group = await AcademicGroup.findById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    // Ensure file was attached
    if (!req.file)
      return res.status(400).json({ message: "PDF file is required" });

    const resource = await AcademicResource.create({
      type,
      groupId,
      title: title.trim(),
      description: description?.trim() || "",
      subject: subject?.trim() || "General",
      examYear: type === "PYQ" ? examYear?.trim() || null : null,
      fileName: req.file.originalname,
      filePath: req.file.path,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      uploadedBy: req.user.userId,
      tags: tags
        ? (Array.isArray(tags) ? tags : tags.split(",")).map((t) => t.trim()).filter(Boolean)
        : [],
    });

    const populated = await resource.populate([
      { path: "uploadedBy", select: "name email role" },
      { path: "groupId", select: "name branch year section type" },
    ]);

    // Strip filePath from response
    const obj = populated.toObject();
    delete obj.filePath;

    res.status(201).json(obj);
  } catch (err) {
    // If file was saved but DB insert failed, clean up
    if (req.file?.path) {
      fs.unlink(req.file.path, () => {});
    }
    if (err.name === "CastError")
      return res.status(400).json({ message: "Invalid groupId" });
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ─── GET /api/resources/group/:groupId ───────────────────────────────────────
// Paginated list with optional filters: type, subject, examYear, search
exports.list = async (req, res) => {
  try {
    const { groupId } = req.params;

    // Membership check
    const member = await isMember(req.user.userId, req.user.role, groupId);
    if (!member)
      return res.status(403).json({ message: "Not a member of this group" });

    const {
      type,
      subject,
      examYear,
      search,
      page = 1,
      limit = 20,
    } = req.query;

    const filter = { groupId };
    if (type && VALID_TYPES.includes(type)) filter.type = type;
    if (subject) filter.subject = { $regex: subject, $options: "i" };
    if (examYear) filter.examYear = examYear;
    if (search) filter.$text = { $search: search };

    const skip = (Math.max(Number(page), 1) - 1) * Math.min(Number(limit), 50);
    const lim = Math.min(Number(limit) || 20, 50);

    const [resources, total] = await Promise.all([
      AcademicResource.find(filter)
        .select("-filePath")
        .populate("uploadedBy", "name email role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(lim)
        .lean(),
      AcademicResource.countDocuments(filter),
    ]);

    res.json({
      resources,
      page: Math.max(Number(page), 1),
      pages: Math.ceil(total / lim) || 1,
      total,
    });
  } catch (err) {
    if (err.name === "CastError")
      return res.status(400).json({ message: "Invalid groupId" });
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ─── GET /api/resources/:resourceId ──────────────────────────────────────────
exports.get = async (req, res) => {
  try {
    const resource = await AcademicResource.findById(req.params.resourceId)
      .select("-filePath")
      .populate("uploadedBy", "name email role")
      .populate("groupId", "name branch year section type");

    if (!resource)
      return res.status(404).json({ message: "Resource not found" });

    // Membership check
    const member = await isMember(
      req.user.userId,
      req.user.role,
      resource.groupId._id
    );
    if (!member)
      return res.status(403).json({ message: "Not a member of this group" });

    res.json(resource);
  } catch (err) {
    if (err.name === "CastError")
      return res.status(400).json({ message: "Invalid resourceId" });
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ─── GET /api/resources/:resourceId/download ─────────────────────────────────
exports.download = async (req, res) => {
  try {
    const resource = await AcademicResource.findById(req.params.resourceId);
    if (!resource)
      return res.status(404).json({ message: "Resource not found" });

    // Membership check
    const member = await isMember(
      req.user.userId,
      req.user.role,
      resource.groupId
    );
    if (!member)
      return res.status(403).json({ message: "Not a member of this group" });

    const filePath = path.resolve(resource.filePath);
    if (!fs.existsSync(filePath))
      return res.status(404).json({ message: "File not found on server" });

    res.download(filePath, resource.fileName);
  } catch (err) {
    if (err.name === "CastError")
      return res.status(400).json({ message: "Invalid resourceId" });
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ─── DELETE /api/resources/:resourceId ───────────────────────────────────────
// Uploader, or any FACULTY / ADMIN can delete
exports.remove = async (req, res) => {
  try {
    const resource = await AcademicResource.findById(req.params.resourceId);
    if (!resource)
      return res.status(404).json({ message: "Resource not found" });

    const isOwner = resource.uploadedBy.toString() === req.user.userId;
    const isMod = ["FACULTY", "ADMIN"].includes(req.user.role);
    if (!isOwner && !isMod)
      return res.status(403).json({ message: "Not allowed" });

    // Remove physical file
    if (resource.filePath && fs.existsSync(path.resolve(resource.filePath))) {
      fs.unlinkSync(path.resolve(resource.filePath));
    }

    await resource.deleteOne();

    res.json({ message: "Resource deleted" });
  } catch (err) {
    if (err.name === "CastError")
      return res.status(400).json({ message: "Invalid resourceId" });
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
