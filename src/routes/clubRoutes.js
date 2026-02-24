const express = require("express");
const router = express.Router();
const clubController = require("../controllers/clubController");
const { protect, authorize } = require("../middleware/authMiddleware");
const uploadImage = require("../middleware/uploadImage");

// Create club — FACULTY / ADMIN (logo upload optional)
router.post(
  "/",
  protect,
  authorize("FACULTY", "ADMIN"),
  uploadImage("club_logos").single("logo"),
  clubController.createClub
);

// List clubs — any authenticated user
router.get("/", protect, clubController.listClubs);

// Club detail — any authenticated user
router.get("/:clubId", protect, clubController.getClub);

// Update club — leader / ADMIN (logo upload optional)
router.patch(
  "/:clubId",
  protect,
  authorize("FACULTY", "ADMIN"),
  uploadImage("club_logos").single("logo"),
  clubController.updateClub
);

// Delete club — leader / ADMIN
router.delete("/:clubId", protect, authorize("FACULTY", "ADMIN"), clubController.deleteClub);

// Join club — STUDENT
router.post("/:clubId/join", protect, authorize("STUDENT"), clubController.joinClub);

// Leave club — STUDENT
router.post("/:clubId/leave", protect, authorize("STUDENT"), clubController.leaveClub);

// Members list — any authenticated user
router.get("/:clubId/members", protect, clubController.getMembers);

// Promote / demote member — leader / ADMIN
router.patch(
  "/:clubId/members/:userId",
  protect,
  authorize("FACULTY", "ADMIN"),
  clubController.promoteMember
);

// Kick member — leader / ADMIN
router.delete(
  "/:clubId/members/:userId",
  protect,
  authorize("FACULTY", "ADMIN"),
  clubController.kickMember
);

// Transfer leadership — leader / ADMIN
router.patch(
  "/:clubId/transfer",
  protect,
  authorize("FACULTY", "ADMIN"),
  clubController.transferLeadership
);

module.exports = router;
