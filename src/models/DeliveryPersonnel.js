const mongoose = require("mongoose");

const deliveryPersonnelSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  phone: {
    type: String,
    required: true,
    unique: true,
  },
  email: {
    type: String,
    required: true,
  },
  vehicleType: {
    type: String,
    enum: ["bike", "scooter", "car", "van", "truck"],
    default: "bike",
  },
  vehicleNumber: {
    type: String,
    required: true,
  },
  drivingLicense: {
    type: String,
    required: true,
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
  isAvailable: {
    type: Boolean,
    default: true,
  },
  status: {
    type: String,
    enum: ["active", "inactive", "on_leave", "busy"],
    default: "active",
  },
  rating: {
    type: Number,
    min: 0,
    max: 5,
    default: 0,
  },
  totalDeliveries: {
    type: Number,
    default: 0,
  },
  successRate: {
    type: Number,
    default: 0,
  },
  assignedOrders: [
    {
      orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
      },
      assignedAt: {
        type: Date,
        default: Date.now,
      },
      completedAt: Date,
      status: String,
    },
  ],
  shiftStart: {
    type: String,
  },
  shiftEnd: {
    type: String,
  },
  workingDays: [
    {
      type: String,
      enum: [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
      ],
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

deliveryPersonnelSchema.index({ currentLocation: "2dsphere" });
deliveryPersonnelSchema.index({ isAvailable: 1, status: 1 });

module.exports = mongoose.model("DeliveryPersonnel", deliveryPersonnelSchema);
