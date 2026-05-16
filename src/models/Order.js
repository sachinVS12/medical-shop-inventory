const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  price: {
    type: Number,
    required: true,
  },
  total: {
    type: Number,
    required: true,
  },
  prescriptionRequired: {
    type: Boolean,
    default: false,
  },
  prescriptionUploaded: {
    type: Boolean,
    default: false,
  },
  prescriptionUrl: {
    type: String,
  },
});

const shippingAddressSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true,
  },
  addressLine1: {
    type: String,
    required: true,
  },
  addressLine2: {
    type: String,
  },
  city: {
    type: String,
    required: true,
  },
  state: {
    type: String,
    required: true,
  },
  postalCode: {
    type: String,
    required: true,
  },
  country: {
    type: String,
    required: true,
    default: "India",
  },
  phone: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  landmark: {
    type: String,
  },
});

const paymentDetailsSchema = new mongoose.Schema({
  method: {
    type: String,
    enum: ["cod", "card", "upi", "netbanking", "wallet"],
    required: true,
  },
  status: {
    type: String,
    enum: ["pending", "processing", "completed", "failed", "refunded"],
    default: "pending",
  },
  transactionId: {
    type: String,
  },
  paymentId: {
    type: String,
  },
  orderId: {
    type: String,
  },
  signature: {
    type: String,
  },
  amount: {
    type: Number,
    required: true,
  },
  currency: {
    type: String,
    default: "INR",
  },
  paidAt: {
    type: Date,
  },
  refundAmount: {
    type: Number,
    default: 0,
  },
  refundReason: {
    type: String,
  },
  refundedAt: {
    type: Date,
  },
  cardDetails: {
    last4: String,
    brand: String,
  },
  upiId: String,
});

const deliveryDetailsSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: [
      "pending",
      "processing",
      "confirmed",
      "picked_up",
      "in_transit",
      "out_for_delivery",
      "delivered",
      "failed",
      "returned",
      "cancelled",
    ],
    default: "pending",
  },
  trackingNumber: {
    type: String,
    unique: true,
    sparse: true,
  },
  courierPartner: {
    type: String,
  },
  estimatedDelivery: {
    type: Date,
  },
  actualDelivery: {
    type: Date,
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "DeliveryPersonnel",
  },
  currentLocation: {
    type: {
      type: String,
      enum: ["Point"],
      default: "Point",
    },
    coordinates: {
      type: [Number],
      default: [0, 0],
    },
  },
  locationHistory: [
    {
      location: {
        type: {
          type: String,
          enum: ["Point"],
          default: "Point",
        },
        coordinates: [Number],
      },
      timestamp: {
        type: Date,
        default: Date.now,
      },
      status: String,
      note: String,
    },
  ],
  deliveryAttempts: {
    type: Number,
    default: 0,
  },
  lastDeliveryAttempt: {
    type: Date,
  },
  deliveryNotes: {
    type: String,
  },
  otp: {
    type: String,
  },
  otpVerified: {
    type: Boolean,
    default: false,
  },
  signature: {
    type: String,
  },
  deliveredTo: {
    type: String,
  },
});

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    required: true,
    unique: true,
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  items: [orderItemSchema],
  subtotal: {
    type: Number,
    required: true,
  },
  discount: {
    type: Number,
    default: 0,
  },
  tax: {
    type: Number,
    default: 0,
  },
  shippingCharge: {
    type: Number,
    default: 0,
  },
  total: {
    type: Number,
    required: true,
  },
  shippingAddress: shippingAddressSchema,
  billingAddress: shippingAddressSchema,
  payment: paymentDetailsSchema,
  delivery: deliveryDetailsSchema,
  status: {
    type: String,
    enum: [
      "pending",
      "confirmed",
      "processing",
      "shipped",
      "delivered",
      "cancelled",
      "refunded",
    ],
    default: "pending",
  },
  prescriptionUploaded: {
    type: Boolean,
    default: false,
  },
  prescriptionFiles: [
    {
      url: String,
      uploadedAt: Date,
      verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      verifiedAt: Date,
      status: {
        type: String,
        enum: ["pending", "approved", "rejected"],
        default: "pending",
      },
    },
  ],
  notes: {
    type: String,
  },
  cancellationReason: {
    type: String,
  },
  cancelledAt: {
    type: Date,
  },
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Indexes for better query performance
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ customer: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ "delivery.status": 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ "payment.status": 1 });

// Generate order number before saving
orderSchema.pre("save", async function (next) {
  if (this.isNew) {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const random = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, "0");
    this.orderNumber = `ORD-${year}${month}${day}-${random}`;
  }
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("Order", orderSchema);
