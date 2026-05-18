const express = require("express");
const {
  initiatePayment,
  verifyPayment,
  getPaymentStatus,
  processRefund,
} = require("../controllers/paymentController");
const { protect } = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const router = express.Router();

router.use(protect);

router.post("/initiate", initiatePayment);
router.post("/verify", verifyPayment);
router.get("/status/:orderId", getPaymentStatus);
router.post("/refund", roleMiddleware("manager"), processRefund);

module.exports = router;
