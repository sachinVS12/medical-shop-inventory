const express = require("express");
const {
  assignDelivery,
  updateDeliveryStatus,
  trackDelivery,
  getDeliveryPersonnel,
  addDeliveryPersonnel,
  updatePersonnelLocation,
  getNearbyPersonnel,
} = require("../controllers/deliveryController");
const { protect } = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const router = express.Router();

// Public tracking
router.get("/track/:trackingNumber", trackDelivery);

// Protected routes
router.use(protect);

// Delivery management
router.post("/assign", roleMiddleware("manager"), assignDelivery);
router.put("/status/:orderId", updateDeliveryStatus);
router.get("/personnel", roleMiddleware("manager"), getDeliveryPersonnel);
router.post("/personnel", roleMiddleware("manager"), addDeliveryPersonnel);
router.put("/personnel/location", updatePersonnelLocation);
router.get("/nearby", roleMiddleware("manager"), getNearbyPersonnel);

module.exports = router;
