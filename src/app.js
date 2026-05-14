const express = require("express");
const cors = require("cors");
const errorMiddleware = require("./middleware/errorMiddleware");

// Import routes
const authRoutes = require("./routes/authRoutes");
const productRoutes = require("./routes/productRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const stockRoutes = require("./routes/stockRoutes");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/stocks", stockRoutes);

// Dashboard route
app.get("/api/dashboard", (req, res) => {
  res.json({ message: "Welcome to Medical Shop Inventory System" });
});

// Error handling middleware
app.use(errorMiddleware);

module.exports = app;
