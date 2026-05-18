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
const paymentRoutes = require("./routes/paymentRoutes");
const deliveryRoutes = require("./routes/deliveryRoutes");

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
app.use("/api/dashboard/manager", managerDashboardRoutes);
app.use("/api/dashboard/user", userDashboardRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/delivery", deliveryRoutes);

// Health check route
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", message: "Server is running" });
});

// Root route
app.get("/", (req, res) => {
  res.json({
    message: "Medical Shop Inventory Management System API",
    version: "1.0.0",
    endpoints: {
      auth: "/api/auth",
      products: "/api/products",
      categories: "/api/categories",
      stocks: "/api/stocks",
      sales: "/api/sales",
      dashboard: "/api/dashboard",
      orders: "/api/orders",
      payments: "/api/payments",
      delivery: "/api/delivery",
    },
  });
});

// Error handling middleware (should be last)
app.use(errorMiddleware);

module.exports = app;
