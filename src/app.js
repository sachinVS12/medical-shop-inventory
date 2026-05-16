const express = require("express");
const cors = require("cors");
const errorMiddleware = require("./middleware/errorMiddleware");

// Import routes
const authRoutes = require("./routes/authRoutes");
const productRoutes = require("./routes/productRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const stockRoutes = require("./routes/stockRoutes");
const saleRoutes = require("./routes/saleRoutes");
const managerDashboardRoutes = require("./routes/managerDashboardRoutes");
const userDashboardRoutes = require("./routes/userDashboardRoutes");
const orderRoutes = require("./routes/orderRoutes");

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
app.use("/api/sales", saleRoutes);

// Separate dashboard routes for different roles
app.use("/api/dashboard/manager", managerDashboardRoutes);
app.use("/api/dashboard/user", userDashboardRoutes);

// Dashboard route
app.get("/api/dashboard", (req, res) => {
  res.json({ message: "Welcome to Medical Shop Inventory System" });
});

// Error handling middleware
app.use(errorMiddleware);

module.exports = app;
