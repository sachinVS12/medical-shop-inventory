const Order = require("../models/Order");
const crypto = require("crypto");

// @desc    Initialize payment
// @route   POST /api/payments/initiate
// @access  Private
const initiatePayment = async (req, res) => {
  try {
    const { orderId, paymentMethod } = req.body;

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Check if order belongs to user
    if (
      order.customer.toString() !== req.user._id.toString() &&
      req.user.role !== "manager"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized",
      });
    }

    // Generate payment ID
    const paymentId = `PAY-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const orderId_ = `ORDER-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    order.payment.method = paymentMethod;
    order.payment.status = "processing";
    order.payment.transactionId = paymentId;
    order.payment.orderId = orderId_;
    await order.save();

    // Mock payment response - In production, integrate with Razorpay/PayPal/Stripe
    res.json({
      success: true,
      data: {
        paymentId,
        orderId: orderId_,
        amount: order.total,
        currency: "INR",
        key: process.env.RAZORPAY_KEY_ID || "mock_key",
        order: order.orderNumber,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Verify payment
// @route   POST /api/payments/verify
// @access  Private
const verifyPayment = async (req, res) => {
  try {
    const { orderId, paymentId, signature, razorpayOrderId } = req.body;

    const order = await Order.findOne({ "payment.orderId": razorpayOrderId });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Verify signature
    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "mock_secret")
      .update(`${razorpayOrderId}|${paymentId}`)
      .digest("hex");

    if (generatedSignature !== signature) {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed",
      });
    }

    // Update order payment status
    order.payment.status = "completed";
    order.payment.paymentId = paymentId;
    order.payment.signature = signature;
    order.payment.paidAt = new Date();
    order.status = "confirmed";

    await order.save();

    res.json({
      success: true,
      message: "Payment verified successfully",
      data: order,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get payment status
// @route   GET /api/payments/status/:orderId
// @access  Private
const getPaymentStatus = async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId).select(
      "payment status orderNumber",
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    res.json({
      success: true,
      data: {
        orderNumber: order.orderNumber,
        paymentStatus: order.payment.status,
        orderStatus: order.status,
        transactionId: order.payment.transactionId,
        paidAt: order.payment.paidAt,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Process refund
// @route   POST /api/payments/refund
// @access  Private/Manager
const processRefund = async (req, res) => {
  try {
    const { orderId, amount, reason } = req.body;

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (order.payment.status !== "completed") {
      return res.status(400).json({
        success: false,
        message: "Payment not completed",
      });
    }

    if (order.status !== "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Only cancelled orders can be refunded",
      });
    }

    order.payment.status = "refunded";
    order.payment.refundAmount = amount || order.total;
    order.payment.refundReason = reason;
    order.payment.refundedAt = new Date();
    order.status = "refunded";

    await order.save();

    res.json({
      success: true,
      message: "Refund processed successfully",
      data: {
        orderNumber: order.orderNumber,
        refundAmount: order.payment.refundAmount,
        refundedAt: order.payment.refundedAt,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  initiatePayment,
  verifyPayment,
  getPaymentStatus,
  processRefund,
};
