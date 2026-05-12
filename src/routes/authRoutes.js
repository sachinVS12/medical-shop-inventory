const express = require("express");
const {
  registerUser,
  loginUser,
  getUserProfile,
  getUsers,
} = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.get("/profile", protect, getUserProfile);
router.get("/users", protect, roleMiddleware("manager"), getUsers);

module.exports = router;
