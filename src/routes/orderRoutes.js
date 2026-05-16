const express = require("express");
const {
  createOrder,
  getOrders,
  getOrderById,
  updateOrderStatus,
  cancelOrder,
} = require("../controllers/orderController");
const { protect } = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const router = express.Router();

// All routes require authentication
router.use(protect);

// Order routes
router.route("/").post(createOrder).get(getOrders);

router.get("/:id", getOrderById);
router.put("/:id/status", roleMiddleware("manager"), updateOrderStatus);
router.put("/:id/cancel", cancelOrder);

module.exports = router;
