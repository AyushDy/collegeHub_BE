const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/authMiddleware");

router.get("/student", protect, authorize("STUDENT"), (req, res) => {
  res.json({ message: "Student route accessed" });
});

router.get("/admin", protect, authorize("ADMIN"), (req, res) => {
  res.json({ message: "Admin route accessed" });
});

module.exports = router;