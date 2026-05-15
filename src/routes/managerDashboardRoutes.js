const express = require("express");
const {
  getManagerDashboard,
  getSalesReport,
  getInventoryReport,
} = require("../controllers/managerDashboardController");
const { protect } = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const router = express.Router();

// All manager dashboard routes require authentication and manager role
router.use(protect);
router.use(roleMiddleware("manager"));

// Main dashboard
router.get("/", getManagerDashboard);

// Reports
router.get("/sales-report", getSalesReport);
router.get("/inventory-report", getInventoryReport);

module.exports = router;
