const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");
const rc = require("../controllers/resourceController");

// Faculty / Admin upload a PDF resource
router.post(
  "/upload",
  protect,
  authorize("FACULTY", "ADMIN"),
  upload.single("file"),
  rc.upload
);

// List resources for a group (all authenticated members)
router.get("/group/:groupId", protect, rc.list);

// Get single resource metadata
router.get("/:resourceId", protect, rc.get);

// Download PDF file
router.get("/:resourceId/download", protect, rc.download);

// Delete resource (uploader or FACULTY / ADMIN)
router.delete("/:resourceId", protect, rc.remove);

module.exports = router;
