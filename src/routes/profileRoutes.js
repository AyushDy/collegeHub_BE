const express = require("express");
const router = express.Router();
const profileController = require("../controllers/profileController");
const { protect, authorize } = require("../middleware/authMiddleware");

// Student routes
router.post("/", protect, authorize("STUDENT"), profileController.createProfile);
router.get("/me", protect, authorize("STUDENT"), profileController.getMyProfile);
router.put("/", protect, authorize("STUDENT"), profileController.updateProfile);

// Faculty / Admin routes
router.get("/export/csv", protect, authorize("FACULTY", "ADMIN"), profileController.exportStudentsCsv);
router.get("/filter", protect, authorize("FACULTY", "ADMIN"), profileController.filterProfiles);
router.get("/view/:id", protect, authorize("FACULTY", "ADMIN"), profileController.viewProfile);

module.exports = router;