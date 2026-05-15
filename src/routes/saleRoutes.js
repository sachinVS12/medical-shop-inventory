const express = require("express");
const {
  createSale,
  getSales,
  getSaleById,
  getSalesReport,
} = require("../controllers/saleController");
const { protect } = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const router = express.Router();

router.route("/").get(protect, getSales).post(protect, createSale);

router.get("/report", protect, roleMiddleware("manager"), getSalesReport);
router.get("/:id", protect, getSaleById);

module.exports = router;
