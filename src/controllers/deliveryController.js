const Order = require("../models/Order");
const DeliveryPersonnel = require("../models/DeliveryPersonnel");

// Generate tracking number
const generateTrackingNumber = () => {
  const prefix = "TRK";
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return `${prefix}${timestamp}${random}`;
};

// @desc    Assign delivery personnel
// @route   POST /api/delivery/assign
// @access  Private/Manager
const assignDelivery = async (req, res) => {
  try {
    const { orderId, deliveryPersonId } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const deliveryPerson = await DeliveryPersonnel.findById(deliveryPersonId);
    if (!deliveryPerson) {
      return res.status(404).json({
        success: false,
        message: "Delivery personnel not found",
      });
    }

    if (!deliveryPerson.isAvailable || deliveryPerson.status !== "active") {
      return res.status(400).json({
        success: false,
        message: "Delivery personnel not available",
      });
    }

    // Generate tracking number
    const trackingNumber = generateTrackingNumber();

    // Update order delivery details
    order.delivery.status = "confirmed";
    order.delivery.trackingNumber = trackingNumber;
    order.delivery.assignedTo = deliveryPersonId;
    order.delivery.estimatedDelivery = new Date(
      Date.now() + 3 * 24 * 60 * 60 * 1000,
    ); // 3 days
    order.status = "processing";

    await order.save();

    // Update delivery personnel
    deliveryPerson.assignedOrders.push({
      orderId: order._id,
      assignedAt: new Date(),
    });
    deliveryPerson.isAvailable = false;
    deliveryPerson.status = "busy";
    await deliveryPerson.save();

    res.json({
      success: true,
      message: "Delivery assigned successfully",
      data: {
        orderNumber: order.orderNumber,
        trackingNumber,
        deliveryPerson: {
          name: deliveryPerson.name,
          phone: deliveryPerson.phone,
          vehicleNumber: deliveryPerson.vehicleNumber,
        },
        estimatedDelivery: order.delivery.estimatedDelivery,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Update delivery status
// @route   PUT /api/delivery/status/:orderId
// @access  Private/Manager/Delivery
const updateDeliveryStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, location, note } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Update delivery status
    order.delivery.status = status;

    // Update location history
    if (location) {
      order.delivery.currentLocation = {
        type: "Point",
        coordinates: [location.lng, location.lat],
      };

      order.delivery.locationHistory.push({
        location: {
          type: "Point",
          coordinates: [location.lng, location.lat],
        },
        status: status,
        note: note,
      });
    }

    // If delivered
    if (status === "delivered") {
      order.delivery.actualDelivery = new Date();
      order.status = "delivered";

      // Update delivery personnel stats
      if (order.delivery.assignedTo) {
        const deliveryPerson = await DeliveryPersonnel.findById(
          order.delivery.assignedTo,
        );
        if (deliveryPerson) {
          deliveryPerson.totalDeliveries += 1;
          deliveryPerson.successRate =
            (deliveryPerson.totalDeliveries /
              (deliveryPerson.totalDeliveries + 1)) *
            100;
          deliveryPerson.isAvailable = true;
          deliveryPerson.status = "active";
          await deliveryPerson.save();
        }
      }
    }

    // If delivery failed
    if (status === "failed") {
      order.delivery.deliveryAttempts += 1;
      order.delivery.lastDeliveryAttempt = new Date();

      if (order.delivery.deliveryAttempts >= 3) {
        order.status = "cancelled";
      }
    }

    await order.save();

    res.json({
      success: true,
      message: `Delivery status updated to ${status}`,
      data: order.delivery,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Track delivery
// @route   GET /api/delivery/track/:trackingNumber
// @access  Public
const trackDelivery = async (req, res) => {
  try {
    const { trackingNumber } = req.params;

    const order = await Order.findOne({
      "delivery.trackingNumber": trackingNumber,
    }).populate("delivery.assignedTo", "name phone vehicleNumber");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Tracking number not found",
      });
    }

    res.json({
      success: true,
      data: {
        orderNumber: order.orderNumber,
        trackingNumber: order.delivery.trackingNumber,
        status: order.delivery.status,
        currentLocation: order.delivery.currentLocation,
        estimatedDelivery: order.delivery.estimatedDelivery,
        actualDelivery: order.delivery.actualDelivery,
        locationHistory: order.delivery.locationHistory,
        deliveryPerson: order.delivery.assignedTo
          ? {
              name: order.delivery.assignedTo.name,
              phone: order.delivery.assignedTo.phone,
              vehicleNumber: order.delivery.assignedTo.vehicleNumber,
            }
          : null,
        notes: order.delivery.deliveryNotes,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get delivery personnel
// @route   GET /api/delivery/personnel
// @access  Private/Manager
const getDeliveryPersonnel = async (req, res) => {
  try {
    const personnel = await DeliveryPersonnel.find().sort("-rating");

    res.json({
      success: true,
      data: personnel,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Add delivery personnel
// @route   POST /api/delivery/personnel
// @access  Private/Manager
const addDeliveryPersonnel = async (req, res) => {
  try {
    const personnel = await DeliveryPersonnel.create(req.body);

    res.status(201).json({
      success: true,
      data: personnel,
      message: "Delivery personnel added successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Update delivery personnel location
// @route   PUT /api/delivery/personnel/location
// @access  Private/Delivery
const updatePersonnelLocation = async (req, res) => {
  try {
    const { personnelId, location } = req.body;

    const personnel = await DeliveryPersonnel.findById(personnelId);
    if (!personnel) {
      return res.status(404).json({
        success: false,
        message: "Delivery personnel not found",
      });
    }

    personnel.currentLocation = {
      type: "Point",
      coordinates: [location.lng, location.lat],
    };

    await personnel.save();

    res.json({
      success: true,
      message: "Location updated successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get nearby delivery personnel
// @route   GET /api/delivery/nearby
// @access  Private/Manager
const getNearbyPersonnel = async (req, res) => {
  try {
    const { lng, lat, radius = 5 } = req.query;

    const personnel = await DeliveryPersonnel.find({
      currentLocation: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [parseFloat(lng), parseFloat(lat)],
          },
          $maxDistance: radius * 1000, // Convert to meters
        },
      },
      isAvailable: true,
      status: "active",
    }).limit(10);

    res.json({
      success: true,
      data: personnel,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  assignDelivery,
  updateDeliveryStatus,
  trackDelivery,
  getDeliveryPersonnel,
  addDeliveryPersonnel,
  updatePersonnelLocation,
  getNearbyPersonnel,
};
