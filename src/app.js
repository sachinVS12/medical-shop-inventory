const express = require("express");
const cors = require("cors");
const errorMiddleware = require("./middleware/errorMiddleware");

// Import routes
const authRoutes = require("./routes/authRoutes");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/auth", authRoutes);

// Dashboard route
app.get("/api/dashboard", (req, res) => {
  res.json({ message: "Welcome to Medical Shop Inventory System" });
});

// Error handling middleware
app.use(errorMiddleware);

module.exports = app;
