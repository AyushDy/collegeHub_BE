const express = require("express");
const router = express.Router();
const dashboardController = require("../controllers/dashboardController");
const { protect } = require("../middleware/authMiddleware");

// GET /api/dashboard — role-based data summary
router.get("/", protect, dashboardController.getDashboard);

module.exports = router;
