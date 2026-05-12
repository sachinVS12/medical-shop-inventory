const express = require("express");
const {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  getLowStockProducts,
} = require("../controllers/productController");
const { protect } = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const router = express.Router();

router
  .route("/")
  .get(protect, getProducts)
  .post(protect, roleMiddleware("manager"), createProduct);

router.get("/low-stock", protect, getLowStockProducts);

router
  .route("/:id")
  .get(protect, getProductById)
  .put(protect, roleMiddleware("manager"), updateProduct)
  .delete(protect, roleMiddleware("manager"), deleteProduct);

module.exports = router;
