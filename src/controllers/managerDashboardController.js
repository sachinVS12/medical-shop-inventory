const Product = require("../models/Product");
const Sale = require("../models/Sale");
const Stock = require("../models/Stock");
const User = require("../models/User");
const Category = require("../models/Category");

// @desc    Get Manager Dashboard Data
// @route   GET /api/dashboard/manager
// @access  Private/Manager
const getManagerDashboard = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    // Parallel queries for better performance
    const [
      totalProducts,
      totalSales,
      totalRevenue,
      totalUsers,
      lowStockProducts,
      expiredProducts,
      expiringSoon,
      todaySales,
      weeklySales,
      monthlySales,
      topProducts,
      categorySales,
      recentActivities,
      pendingAlerts,
      stockValue,
      userPerformance,
      monthlyComparison,
      categoryWiseStock,
    ] = await Promise.all([
      // Total products count
      Product.countDocuments(),

      // Total sales count
      Sale.countDocuments(),

      // Total revenue
      Sale.aggregate([{ $group: { _id: null, total: { $sum: "$total" } } }]),

      // Total users
      User.countDocuments(),

      // Low stock products
      Product.find({
        $expr: { $lte: ["$quantity", "$reorderLevel"] },
      })
        .select("name quantity reorderLevel batchNumber")
        .limit(10),

      // Expired products
      Product.find({
        expiryDate: { $lt: today },
        quantity: { $gt: 0 },
      })
        .select("name quantity expiryDate batchNumber")
        .limit(10),

      // Expiring soon (next 30 days)
      Product.find({
        expiryDate: {
          $gte: today,
          $lte: new Date(today.setDate(today.getDate() + 30)),
        },
        quantity: { $gt: 0 },
      })
        .select("name quantity expiryDate batchNumber")
        .limit(10),

      // Today's sales
      Sale.aggregate([
        { $match: { createdAt: { $gte: today, $lt: tomorrow } } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            revenue: { $sum: "$total" },
            items: { $sum: { $size: "$items" } },
          },
        },
      ]),

      // Weekly sales
      Sale.aggregate([
        { $match: { createdAt: { $gte: startOfWeek } } },
        {
          $group: {
            _id: { $dayOfWeek: "$createdAt" },
            revenue: { $sum: "$total" },
            count: { $sum: 1 },
            day: { $first: { $dayOfWeek: "$createdAt" } },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Monthly sales
      Sale.aggregate([
        { $match: { createdAt: { $gte: startOfMonth, $lte: endOfMonth } } },
        {
          $group: {
            _id: { $dayOfMonth: "$createdAt" },
            revenue: { $sum: "$total" },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Top selling products
      Sale.aggregate([
        { $unwind: "$items" },
        {
          $group: {
            _id: "$items.product",
            totalSold: { $sum: "$items.quantity" },
            revenue: { $sum: "$items.total" },
          },
        },
        { $sort: { totalSold: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: "products",
            localField: "_id",
            foreignField: "_id",
            as: "product",
          },
        },
        { $unwind: "$product" },
      ]),

      // Sales by category
      Sale.aggregate([
        { $unwind: "$items" },
        {
          $lookup: {
            from: "products",
            localField: "items.product",
            foreignField: "_id",
            as: "product",
          },
        },
        { $unwind: "$product" },
        {
          $group: {
            _id: "$product.category",
            totalSales: { $sum: "$items.total" },
            quantity: { $sum: "$items.quantity" },
          },
        },
        {
          $lookup: {
            from: "categories",
            localField: "_id",
            foreignField: "_id",
            as: "category",
          },
        },
        { $unwind: "$category" },
        { $sort: { totalSales: -1 } },
      ]),

      // Recent activities (stock movements and sales)
      Promise.all([
        Stock.find()
          .sort("-createdAt")
          .limit(10)
          .populate("product", "name")
          .populate("updatedBy", "name"),
        Sale.find().sort("-createdAt").limit(10).populate("soldBy", "name"),
      ]),

      // Pending alerts
      Promise.all([
        Product.countDocuments({
          $expr: { $lte: ["$quantity", "$reorderLevel"] },
        }),
        Product.countDocuments({
          expiryDate: { $lt: new Date() },
          quantity: { $gt: 0 },
        }),
        Product.countDocuments({
          expiryDate: {
            $gte: new Date(),
            $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
          quantity: { $gt: 0 },
        }),
      ]),

      // Total stock value
      Product.aggregate([
        {
          $group: {
            _id: null,
            purchaseValue: {
              $sum: { $multiply: ["$quantity", "$price.purchasePrice"] },
            },
            sellingValue: {
              $sum: { $multiply: ["$quantity", "$price.sellingPrice"] },
            },
          },
        },
      ]),

      // User performance (sales by user)
      Sale.aggregate([
        {
          $group: {
            _id: "$soldBy",
            totalSales: { $sum: 1 },
            totalRevenue: { $sum: "$total" },
            totalItems: { $sum: { $size: "$items" } },
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "user",
          },
        },
        { $unwind: "$user" },
        { $sort: { totalRevenue: -1 } },
      ]),

      // Monthly comparison (current month vs last month)
      Promise.all([
        Sale.aggregate([
          {
            $match: {
              createdAt: {
                $gte: startOfMonth,
                $lte: endOfMonth,
              },
            },
          },
          { $group: { _id: null, total: { $sum: "$total" } } },
        ]),
        Sale.aggregate([
          {
            $match: {
              createdAt: {
                $gte: new Date(today.getFullYear(), today.getMonth() - 1, 1),
                $lte: new Date(today.getFullYear(), today.getMonth(), 0),
              },
            },
          },
          { $group: { _id: null, total: { $sum: "$total" } } },
        ]),
      ]),

      // Category wise stock distribution
      Product.aggregate([
        {
          $group: {
            _id: "$category",
            totalProducts: { $sum: 1 },
            totalQuantity: { $sum: "$quantity" },
            totalValue: {
              $sum: { $multiply: ["$quantity", "$price.sellingPrice"] },
            },
          },
        },
        {
          $lookup: {
            from: "categories",
            localField: "_id",
            foreignField: "_id",
            as: "category",
          },
        },
        { $unwind: "$category" },
      ]),
    ]);

    // Calculate growth percentages
    const currentWeekTotal = weeklySales.reduce(
      (sum, day) => sum + day.revenue,
      0,
    );
    const lastWeekStart = new Date(startOfWeek);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekEnd = new Date(startOfWeek);
    lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);

    const lastWeekSales = await Sale.aggregate([
      {
        $match: {
          createdAt: { $gte: lastWeekStart, $lte: lastWeekEnd },
        },
      },
      { $group: { _id: null, total: { $sum: "$total" } } },
    ]);

    const monthlyTotal = monthlySales.reduce(
      (sum, day) => sum + day.revenue,
      0,
    );
    const weeklyGrowth = lastWeekSales[0]?.total
      ? (
          ((currentWeekTotal - lastWeekSales[0].total) /
            lastWeekSales[0].total) *
          100
        ).toFixed(2)
      : 0;

    const monthlyGrowth = monthlyComparison[1][0]?.total
      ? (
          ((monthlyTotal - monthlyComparison[1][0].total) /
            monthlyComparison[1][0].total) *
          100
        ).toFixed(2)
      : 0;

    // Prepare day names for weekly sales
    const dayNames = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const weeklySalesData = dayNames.map((day, index) => {
      const sale = weeklySales.find((s) => s.day === index + 1);
      return {
        day,
        revenue: sale?.revenue || 0,
        count: sale?.count || 0,
      };
    });

    res.json({
      success: true,
      data: {
        overview: {
          totalProducts,
          totalSales,
          totalRevenue: totalRevenue[0]?.total || 0,
          totalUsers,
          stockValue: {
            purchaseValue: stockValue[0]?.purchaseValue || 0,
            sellingValue: stockValue[0]?.sellingValue || 0,
            profit:
              (stockValue[0]?.sellingValue || 0) -
              (stockValue[0]?.purchaseValue || 0),
          },
        },
        sales: {
          today: {
            count: todaySales[0]?.count || 0,
            revenue: todaySales[0]?.revenue || 0,
            items: todaySales[0]?.items || 0,
          },
          weekly: {
            total: currentWeekTotal,
            growth: weeklyGrowth,
            data: weeklySalesData,
          },
          monthly: {
            total: monthlyTotal,
            growth: monthlyGrowth,
            data: monthlySales,
          },
          comparison: {
            currentMonth: monthlyTotal,
            previousMonth: monthlyComparison[1][0]?.total || 0,
            difference: monthlyTotal - (monthlyComparison[1][0]?.total || 0),
          },
        },
        alerts: {
          lowStock: {
            count: pendingAlerts[0],
            products: lowStockProducts.map((p) => ({
              id: p._id,
              name: p.name,
              quantity: p.quantity,
              reorderLevel: p.reorderLevel,
              batchNumber: p.batchNumber,
              status: p.quantity === 0 ? "out_of_stock" : "low_stock",
            })),
          },
          expired: {
            count: pendingAlerts[1],
            products: expiredProducts.map((p) => ({
              id: p._id,
              name: p.name,
              quantity: p.quantity,
              expiryDate: p.expiryDate,
              batchNumber: p.batchNumber,
              daysOverdue: Math.floor(
                (new Date() - p.expiryDate) / (1000 * 60 * 60 * 24),
              ),
            })),
          },
          expiringSoon: {
            count: pendingAlerts[2],
            products: expiringSoon.map((p) => ({
              id: p._id,
              name: p.name,
              quantity: p.quantity,
              expiryDate: p.expiryDate,
              batchNumber: p.batchNumber,
              daysLeft: Math.ceil(
                (p.expiryDate - new Date()) / (1000 * 60 * 60 * 24),
              ),
            })),
          },
        },
        topProducts: topProducts.map((p) => ({
          id: p.product._id,
          name: p.product.name,
          totalSold: p.totalSold,
          revenue: p.revenue,
          stock: p.product.quantity,
          batchNumber: p.product.batchNumber,
          sellingPrice: p.product.price?.sellingPrice,
        })),
        categoryPerformance: categorySales.map((c) => ({
          categoryId: c._id,
          categoryName: c.category.name,
          totalSales: c.totalSales,
          quantity: c.quantity,
          percentage: (
            (c.totalSales / (totalRevenue[0]?.total || 1)) *
            100
          ).toFixed(2),
        })),
        categoryWiseStock: categoryWiseStock.map((c) => ({
          categoryId: c._id,
          categoryName: c.category.name,
          totalProducts: c.totalProducts,
          totalQuantity: c.totalQuantity,
          totalValue: c.totalValue,
          percentage: (
            (c.totalValue / (stockValue[0]?.sellingValue || 1)) *
            100
          ).toFixed(2),
        })),
        userPerformance: userPerformance.map((u) => ({
          userId: u.user._id,
          userName: u.user.name,
          userEmail: u.user.email,
          totalSales: u.totalSales,
          totalRevenue: u.totalRevenue,
          totalItems: u.totalItems,
          averagePerSale: (u.totalRevenue / u.totalSales).toFixed(2),
        })),
        recentActivities: [
          ...recentActivities[0].map((s) => ({
            type: "stock",
            action: s.type === "in" ? "Stock Added" : "Stock Removed",
            product: s.product.name,
            quantity: Math.abs(s.quantityChanged),
            user: s.updatedBy.name,
            time: s.createdAt,
            reference: s.reference,
          })),
          ...recentActivities[1].map((s) => ({
            type: "sale",
            action: "Sale Made",
            invoice: s.invoiceNumber,
            amount: s.total,
            user: s.soldBy.name,
            time: s.createdAt,
            items: s.items.length,
          })),
        ]
          .sort((a, b) => new Date(b.time) - new Date(a.time))
          .slice(0, 20),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get Manager Sales Report
// @route   GET /api/dashboard/manager/sales-report
// @access  Private/Manager
const getSalesReport = async (req, res) => {
  try {
    const { period = "month", startDate, endDate } = req.query;

    let dateFilter = {};
    const today = new Date();

    if (startDate && endDate) {
      dateFilter = {
        createdAt: {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        },
      };
    } else {
      switch (period) {
        case "week":
          const startOfWeek = new Date(today);
          startOfWeek.setDate(today.getDate() - today.getDay());
          dateFilter = {
            createdAt: { $gte: startOfWeek },
          };
          break;
        case "month":
          const startOfMonth = new Date(
            today.getFullYear(),
            today.getMonth(),
            1,
          );
          dateFilter = {
            createdAt: { $gte: startOfMonth },
          };
          break;
        case "year":
          const startOfYear = new Date(today.getFullYear(), 0, 1);
          dateFilter = {
            createdAt: { $gte: startOfYear },
          };
          break;
      }
    }

    const salesData = await Sale.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          },
          totalSales: { $sum: 1 },
          totalRevenue: { $sum: "$total" },
          averageOrderValue: { $avg: "$total" },
        },
      },
      { $sort: { "_id.date": 1 } },
    ]);

    const summary = await Sale.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: null,
          totalSales: { $sum: 1 },
          totalRevenue: { $sum: "$total" },
          totalItems: { $sum: { $size: "$items" } },
          averageOrderValue: { $avg: "$total" },
        },
      },
    ]);

    res.json({
      success: true,
      data: {
        summary: summary[0] || {
          totalSales: 0,
          totalRevenue: 0,
          totalItems: 0,
          averageOrderValue: 0,
        },
        dailyBreakdown: salesData,
        period: period,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get Manager Inventory Report
// @route   GET /api/dashboard/manager/inventory-report
// @access  Private/Manager
const getInventoryReport = async (req, res) => {
  try {
    const products = await Product.find()
      .populate("category", "name")
      .sort("-quantity");

    const totalProducts = products.length;
    const totalQuantity = products.reduce((sum, p) => sum + p.quantity, 0);
    const totalValue = products.reduce(
      (sum, p) => sum + p.price.sellingPrice * p.quantity,
      0,
    );
    const lowStockCount = products.filter(
      (p) => p.quantity <= p.reorderLevel,
    ).length;
    const outOfStockCount = products.filter((p) => p.quantity === 0).length;

    const categoryBreakdown = await Product.aggregate([
      {
        $group: {
          _id: "$category",
          productCount: { $sum: 1 },
          totalQuantity: { $sum: "$quantity" },
          totalValue: {
            $sum: { $multiply: ["$quantity", "$price.sellingPrice"] },
          },
        },
      },
      {
        $lookup: {
          from: "categories",
          localField: "_id",
          foreignField: "_id",
          as: "category",
        },
      },
      { $unwind: "$category" },
    ]);

    res.json({
      success: true,
      data: {
        summary: {
          totalProducts,
          totalQuantity,
          totalValue,
          lowStockCount,
          outOfStockCount,
          healthyStockCount: totalProducts - lowStockCount - outOfStockCount,
        },
        categoryBreakdown: categoryBreakdown.map((c) => ({
          categoryName: c.category.name,
          productCount: c.productCount,
          totalQuantity: c.totalQuantity,
          totalValue: c.totalValue,
          percentage: ((c.totalValue / totalValue) * 100).toFixed(2),
        })),
        lowStockProducts: products
          .filter((p) => p.quantity <= p.reorderLevel && p.quantity > 0)
          .map((p) => ({
            id: p._id,
            name: p.name,
            quantity: p.quantity,
            reorderLevel: p.reorderLevel,
            category: p.category?.name,
            batchNumber: p.batchNumber,
          })),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  getManagerDashboard,
  getSalesReport,
  getInventoryReport,
};
