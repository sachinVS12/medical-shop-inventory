const express = require("express");
const {
  getUserDashboard,
  getUserSalesHistory,
  getUserPerformance,
} = require("../controllers/userDashboardController");
const { protect } = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const router = express.Router();

// All user dashboard routes require authentication and user role
router.use(protect);
router.use(roleMiddleware("user"));

// Main dashboard
router.get("/", getUserDashboard);

// User specific routes
router.get("/sales-history", getUserSalesHistory);
router.get("/performance", getUserPerformance);

module.exports = router;
