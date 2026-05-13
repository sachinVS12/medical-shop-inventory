const express = require("express");
const {
  createCategory,
  getCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
  searchCategories,
  getCategoryStats,
  bulkDeleteCategories,
} = require("../controllers/categoryController");
const { protect } = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const router = express.Router();

// All routes require authentication
router.use(protect);

// Public routes (for authenticated users)
router.get("/", getCategories);
router.get("/search", searchCategories);
router.get("/stats", roleMiddleware("manager"), getCategoryStats);
router.get("/:id", getCategoryById);

// Manager only routes
router.post("/", roleMiddleware("manager"), createCategory);
router.put("/:id", roleMiddleware("manager"), updateCategory);
router.delete("/:id", roleMiddleware("manager"), deleteCategory);
router.delete("/bulk", roleMiddleware("manager"), bulkDeleteCategories);

module.exports = router;
