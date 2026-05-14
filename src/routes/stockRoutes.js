const express = require("express");
const {
  getStockMovements,
  getStockMovementById,
  addStock,
  removeStock,
  transferStock,
  getStockSummary,
  getProductStockHistory,
  adjustStock,
  getStockReport,
} = require("../controllers/stockController");
const { protect } = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const router = express.Router();

// All routes require authentication
router.use(protect);

// Summary and report routes
router.get("/summary", getStockSummary);
router.get("/report", roleMiddleware("manager"), getStockReport);
router.get("/product/:productId", getProductStockHistory);

// Stock movement routes
router.get("/", getStockMovements);
router.get("/:id", getStockMovementById);

// Manager only routes
router.post("/add-stock", roleMiddleware("manager"), addStock);
router.post("/remove-stock", roleMiddleware("manager"), removeStock);
router.post("/transfer", roleMiddleware("manager"), transferStock);
router.put("/adjust/:productId", roleMiddleware("manager"), adjustStock);

module.exports = router;
