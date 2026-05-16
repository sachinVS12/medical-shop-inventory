const Order = require("../models/Order");
const Product = require("../models/Product");
const Stock = require("../models/Stock");
const crypto = require("crypto");

// Generate unique order number
const generateOrderNumber = () => {
  const date = new Date();
  const timestamp = date.getTime();
  const random = Math.floor(Math.random() * 10000);
  return `ORD-${timestamp}-${random}`;
};

// @desc    Create new order
// @route   POST /api/orders
// @access  Private
const createOrder = async (req, res) => {
  try {
    const { items, shippingAddress, billingAddress, paymentMethod, notes } =
      req.body;

    // Validate items and check stock
    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: `Product not found: ${item.productId}`,
        });
      }

      if (product.quantity < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${product.name}. Available: ${product.quantity}`,
        });
      }

      const total = product.price.sellingPrice * item.quantity;
      subtotal += total;

      orderItems.push({
        product: product._id,
        name: product.name,
        quantity: item.quantity,
        price: product.price.sellingPrice,
        total: total,
        prescriptionRequired: product.prescriptionRequired,
        prescriptionUploaded: item.prescriptionUploaded || false,
        prescriptionUrl: item.prescriptionUrl || null,
      });
    }

    // Calculate totals
    const tax = subtotal * 0.05; // 5% tax
    const shippingCharge = calculateShippingCharge(shippingAddress);
    const discount = 0;
    const total = subtotal + tax + shippingCharge - discount;

    // Create order
    const order = await Order.create({
      orderNumber: generateOrderNumber(),
      customer: req.user._id,
      items: orderItems,
      subtotal,
      discount,
      tax,
      shippingCharge,
      total,
      shippingAddress,
      billingAddress: billingAddress || shippingAddress,
      payment: {
        method: paymentMethod,
        status: "pending",
        amount: total,
      },
      delivery: {
        status: "pending",
      },
      notes,
      prescriptionUploaded: orderItems.some(
        (item) => item.prescriptionRequired,
      ),
    });

    // Reserve stock (reduce quantity)
    for (const item of orderItems) {
      const product = await Product.findById(item.product);
      const oldQuantity = product.quantity;
      product.quantity -= item.quantity;
      await product.save();

      // Create stock movement record
      await Stock.create({
        product: product._id,
        previousQuantity: oldQuantity,
        newQuantity: product.quantity,
        quantityChanged: -item.quantity,
        type: "out",
        reference: "order",
        referenceId: order._id,
        notes: `Order #${order.orderNumber} created`,
        updatedBy: req.user._id,
      });
    }

    res.status(201).json({
      success: true,
      data: order,
      message: "Order created successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Helper function to calculate shipping charge
const calculateShippingCharge = (address) => {
  // Implement logic based on location, weight, etc.
  return 50; // Default shipping charge
};

// @desc    Get all orders (with filters)
// @route   GET /api/orders
// @access  Private
const getOrders = async (req, res) => {
  try {
    const {
      status,
      paymentStatus,
      deliveryStatus,
      startDate,
      endDate,
      page = 1,
      limit = 20,
    } = req.query;

    const filter = {};

    // Role-based filtering
    if (req.user.role === "user") {
      filter.customer = req.user._id;
    }

    if (status) filter.status = status;
    if (paymentStatus) filter["payment.status"] = paymentStatus;
    if (deliveryStatus) filter["delivery.status"] = deliveryStatus;

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    const orders = await Order.find(filter)
      .populate("customer", "name email phone")
      .populate("delivery.assignedTo", "name phone vehicleNumber")
      .sort("-createdAt")
      .skip(skip)
      .limit(limitNumber);

    const total = await Order.countDocuments(filter);

    res.json({
      success: true,
      data: orders,
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total,
        pages: Math.ceil(total / limitNumber),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get order by ID
// @route   GET /api/orders/:id
// @access  Private
const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("customer", "name email phone")
      .populate("delivery.assignedTo", "name phone vehicleNumber")
      .populate("cancelledBy", "name");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Check authorization
    if (
      req.user.role !== "manager" &&
      order.customer._id.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view this order",
      });
    }

    res.json({
      success: true,
      data: order,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Update order status
// @route   PUT /api/orders/:id/status
// @access  Private/Manager
const updateOrderStatus = async (req, res) => {
  try {
    const { status, notes } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    order.status = status;
    order.notes = notes || order.notes;
    await order.save();

    res.json({
      success: true,
      data: order,
      message: `Order status updated to ${status}`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Cancel order
// @route   PUT /api/orders/:id/cancel
// @access  Private
const cancelOrder = async (req, res) => {
  try {
    const { reason } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Check if order can be cancelled
    if (order.status === "delivered") {
      return res.status(400).json({
        success: false,
        message: "Delivered orders cannot be cancelled",
      });
    }

    if (order.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Order is already cancelled",
      });
    }

    // Return stock to inventory
    for (const item of order.items) {
      const product = await Product.findById(item.product);
      if (product) {
        const oldQuantity = product.quantity;
        product.quantity += item.quantity;
        await product.save();

        await Stock.create({
          product: product._id,
          previousQuantity: oldQuantity,
          newQuantity: product.quantity,
          quantityChanged: item.quantity,
          type: "in",
          reference: "cancellation",
          referenceId: order._id,
          notes: `Order #${order.orderNumber} cancelled. Stock returned.`,
          updatedBy: req.user._id,
        });
      }
    }

    order.status = "cancelled";
    order.cancellationReason = reason;
    order.cancelledAt = new Date();
    order.cancelledBy = req.user._id;
    order.delivery.status = "cancelled";

    await order.save();

    res.json({
      success: true,
      data: order,
      message: "Order cancelled successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  createOrder,
  getOrders,
  getOrderById,
  updateOrderStatus,
  cancelOrder,
};
