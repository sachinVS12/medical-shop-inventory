const Product = require("../models/Product");
const Sale = require("../models/Sale");
const Stock = require("../models/Stock");
const Category = require("../models/Category");

// @desc    Get User Dashboard Data
// @route   GET /api/dashboard/user
// @access  Private/User
const getUserDashboard = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());

    const [
      totalProducts,
      lowStockProducts,
      todaySales,
      myTodaySales,
      myRecentSales,
      expiringProducts,
      quickActions,
      totalStockValue,
      myWeeklyPerformance,
      topProducts,
      myRank,
      availableProducts,
    ] = await Promise.all([
      // Total products count
      Product.countDocuments(),

      // Low stock products (limited view)
      Product.find({
        $expr: { $lte: ["$quantity", "$reorderLevel"] },
      })
        .select("name quantity reorderLevel batchNumber expiryDate")
        .limit(5),

      // Today's overall sales
      Sale.aggregate([
        { $match: { createdAt: { $gte: today, $lt: tomorrow } } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            revenue: { $sum: "$total" },
          },
        },
      ]),

      // My today's sales
      Sale.aggregate([
        {
          $match: {
            createdAt: { $gte: today, $lt: tomorrow },
            soldBy: req.user._id,
          },
        },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            revenue: { $sum: "$total" },
            items: { $sum: { $size: "$items" } },
          },
        },
      ]),

      // My recent sales (last 10)
      Sale.find({ soldBy: req.user._id })
        .sort("-createdAt")
        .limit(10)
        .populate("items.product", "name batchNumber price"),

      // Products expiring soon (next 30 days)
      Product.find({
        expiryDate: {
          $gte: today,
          $lte: new Date(today.setDate(today.getDate() + 30)),
        },
        quantity: { $gt: 0 },
      })
        .select("name quantity expiryDate batchNumber")
        .limit(5),

      // Quick actions data
      Promise.all([
        Product.countDocuments({
          $expr: { $lte: ["$quantity", "$reorderLevel"] },
        }),
        Product.find({ quantity: { $gt: 0 } })
          .sort("-createdAt")
          .limit(5)
          .select("name quantity price.sellingPrice batchNumber"),
        Category.find().limit(10),
        Product.aggregate([
          {
            $group: {
              _id: null,
              avgPrice: { $avg: "$price.sellingPrice" },
              maxPrice: { $max: "$price.sellingPrice" },
              minPrice: { $min: "$price.sellingPrice" },
            },
          },
        ]),
      ]),

      // Total stock value (selling price)
      Product.aggregate([
        {
          $group: {
            _id: null,
            total: {
              $sum: { $multiply: ["$quantity", "$price.sellingPrice"] },
            },
          },
        },
      ]),

      // My weekly performance
      Sale.aggregate([
        {
          $match: {
            createdAt: { $gte: startOfWeek },
            soldBy: req.user._id,
          },
        },
        {
          $group: {
            _id: { $dayOfWeek: "$createdAt" },
            sales: { $sum: 1 },
            revenue: { $sum: "$total" },
            items: { $sum: { $size: "$items" } },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Top selling products by this user
      Sale.aggregate([
        { $match: { soldBy: req.user._id } },
        { $unwind: "$items" },
        {
          $group: {
            _id: "$items.product",
            totalSold: { $sum: "$items.quantity" },
            revenue: { $sum: "$items.total" },
          },
        },
        { $sort: { totalSold: -1 } },
        { $limit: 5 },
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

      // User rank among all users
      Sale.aggregate([
        {
          $group: {
            _id: "$soldBy",
            totalRevenue: { $sum: "$total" },
            totalSales: { $sum: 1 },
          },
        },
        { $sort: { totalRevenue: -1 } },
        {
          $group: {
            _id: null,
            users: { $push: "$$ROOT" },
          },
        },
      ]),

      // Available products for quick sale
      Product.find({
        quantity: { $gt: 0 },
        expiryDate: { $gt: new Date() },
      })
        .select("name quantity price.sellingPrice batchNumber")
        .limit(20),
    ]);

    // Calculate performance metrics
    const currentWeekTotal = myWeeklyPerformance.reduce(
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
          soldBy: req.user._id,
        },
      },
      { $group: { _id: null, total: { $sum: "$total" } } },
    ]);

    const weeklyGrowth = lastWeekSales[0]?.total
      ? (
          ((currentWeekTotal - lastWeekSales[0].total) /
            lastWeekSales[0].total) *
          100
        ).toFixed(2)
      : 0;

    // Calculate user rank
    let userRank = null;
    if (myRank[0]) {
      const rankIndex = myRank[0].users.findIndex(
        (u) => u._id.toString() === req.user._id.toString(),
      );
      userRank = {
        position: rankIndex + 1,
        totalUsers: myRank[0].users.length,
        topPerformer:
          myRank[0].users[0]?._id.toString() === req.user._id.toString(),
        revenueGap:
          rankIndex > 0
            ? myRank[0].users[0].totalRevenue -
              (myRank[0].users[rankIndex]?.totalRevenue || 0)
            : 0,
      };
    }

    // Prepare weekly performance data
    const dayNames = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const weeklyPerformanceData = dayNames.map((day, index) => {
      const performance = myWeeklyPerformance.find((p) => p._id === index + 1);
      return {
        day,
        sales: performance?.sales || 0,
        revenue: performance?.revenue || 0,
        items: performance?.items || 0,
      };
    });

    res.json({
      success: true,
      data: {
        user: {
          id: req.user._id,
          name: req.user.name,
          email: req.user.email,
          role: req.user.role,
          joinDate: req.user.createdAt,
        },
        overview: {
          totalProducts,
          todaySales: {
            total: todaySales[0]?.revenue || 0,
            count: todaySales[0]?.count || 0,
          },
          myPerformance: {
            todayRevenue: myTodaySales[0]?.revenue || 0,
            todaySales: myTodaySales[0]?.count || 0,
            todayItems: myTodaySales[0]?.items || 0,
            weeklyTotal: currentWeekTotal,
            weeklyGrowth: parseFloat(weeklyGrowth),
            averagePerSale:
              myTodaySales[0]?.count > 0
                ? (myTodaySales[0]?.revenue / myTodaySales[0]?.count).toFixed(2)
                : 0,
          },
          totalStockValue: totalStockValue[0]?.total || 0,
          rank: userRank,
        },
        alerts: {
          lowStockCount: quickActions[0],
          expiringCount: expiringProducts.length,
          lowStockProducts: lowStockProducts.map((p) => ({
            id: p._id,
            name: p.name,
            quantity: p.quantity,
            reorderLevel: p.reorderLevel,
            batchNumber: p.batchNumber,
          })),
          expiringProducts: expiringProducts.map((p) => ({
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
        quickAccess: {
          recentProducts: quickActions[1].map((p) => ({
            id: p._id,
            name: p.name,
            price: p.price.sellingPrice,
            stock: p.quantity,
            batchNumber: p.batchNumber,
          })),
          categories: quickActions[2].map((c) => ({
            id: c._id,
            name: c.name,
          })),
          priceStats: quickActions[3][0] || {
            avgPrice: 0,
            maxPrice: 0,
            minPrice: 0,
          },
        },
        recentSales: myRecentSales.map((sale) => ({
          id: sale._id,
          invoiceNumber: sale.invoiceNumber,
          total: sale.total,
          items: sale.items.length,
          customerName: sale.customerName || "Walk-in Customer",
          paymentMethod: sale.paymentMethod,
          createdAt: sale.createdAt,
          products: sale.items.map((item) => ({
            name: item.product.name,
            quantity: item.quantity,
            price: item.price,
          })),
        })),
        topProducts: topProducts.map((p) => ({
          id: p.product._id,
          name: p.product.name,
          totalSold: p.totalSold,
          revenue: p.revenue,
          availableStock: p.product.quantity,
          price: p.product.price.sellingPrice,
        })),
        weeklyPerformance: weeklyPerformanceData,
        availableProducts: availableProducts.map((p) => ({
          id: p._id,
          name: p.name,
          price: p.price.sellingPrice,
          stock: p.quantity,
          batchNumber: p.batchNumber,
        })),
        tips: generateUserTips(
          lowStockProducts.length,
          expiringProducts.length,
          myTodaySales[0]?.count || 0,
          userRank?.position,
          weeklyGrowth,
        ),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Helper function to generate user tips
const generateUserTips = (
  lowStockCount,
  expiringCount,
  todaySalesCount,
  rank,
  weeklyGrowth,
) => {
  const tips = [];

  // Performance tips
  if (rank === 1) {
    tips.push({
      type: "achievement",
      icon: "🏆",
      message:
        "Congratulations! You are the top performer! Keep up the excellent work!",
    });
  } else if (rank && rank <= 3) {
    tips.push({
      type: "motivation",
      icon: "⭐",
      message: `You're in top ${rank} position! Just ${rank === 2 ? "one" : "a few"} more sales to become #1!`,
    });
  }

  // Stock alerts
  if (lowStockCount > 0) {
    tips.push({
      type: "warning",
      icon: "⚠️",
      message: `${lowStockCount} product${lowStockCount > 1 ? "s are" : " is"} low in stock. Please inform the manager or suggest alternatives to customers.`,
    });
  }

  // Expiry alerts
  if (expiringCount > 0) {
    tips.push({
      type: "warning",
      icon: "📅",
      message: `${expiringCount} product${expiringCount > 1 ? "s are" : " is"} expiring soon. Consider offering discounts or suggesting alternatives.`,
    });
  }

  // Sales performance tips
  if (todaySalesCount === 0) {
    tips.push({
      type: "info",
      icon: "💡",
      message:
        "No sales recorded today. Try engaging with customers and highlighting current offers.",
    });
  } else if (todaySalesCount < 5) {
    tips.push({
      type: "info",
      icon: "📈",
      message: `You've made ${todaySalesCount} sale${todaySalesCount > 1 ? "s" : ""} today. Try to increase customer engagement for better results.`,
    });
  } else if (todaySalesCount > 10) {
    tips.push({
      type: "success",
      icon: "🎉",
      message: `Excellent! ${todaySalesCount} sales today! You're on fire! Keep up the momentum!`,
    });
  }

  // Growth tips
  if (weeklyGrowth > 0) {
    tips.push({
      type: "success",
      icon: "📊",
      message: `Your weekly performance is up by ${weeklyGrowth}% compared to last week! Great improvement!`,
    });
  } else if (weeklyGrowth < 0) {
    tips.push({
      type: "info",
      icon: "📉",
      message: `Your sales are down by ${Math.abs(weeklyGrowth)}% this week. Try new strategies to boost sales.`,
    });
  }

  // General tips
  tips.push({
    type: "tip",
    icon: "💊",
    message:
      "Always verify prescription requirements for antibiotics and scheduled drugs before selling.",
  });

  tips.push({
    type: "tip",
    icon: "🤝",
    message:
      "Building good customer relationships leads to repeat business and referrals.",
  });

  return tips;
};

// @desc    Get User Sales History
// @route   GET /api/dashboard/user/sales-history
// @access  Private/User
const getUserSalesHistory = async (req, res) => {
  try {
    const { page = 1, limit = 20, startDate, endDate } = req.query;

    const filter = { soldBy: req.user._id };

    if (startDate && endDate) {
      filter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    const sales = await Sale.find(filter)
      .sort("-createdAt")
      .skip(skip)
      .limit(limitNumber)
      .populate("items.product", "name batchNumber");

    const total = await Sale.countDocuments(filter);

    // Calculate summary
    const summary = await Sale.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalSales: { $sum: 1 },
          totalRevenue: { $sum: "$total" },
          totalItems: { $sum: { $size: "$items" } },
          averageValue: { $avg: "$total" },
        },
      },
    ]);

    res.json({
      success: true,
      data: {
        sales,
        summary: summary[0] || {
          totalSales: 0,
          totalRevenue: 0,
          totalItems: 0,
          averageValue: 0,
        },
        pagination: {
          page: pageNumber,
          limit: limitNumber,
          total,
          pages: Math.ceil(total / limitNumber),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get User Performance Stats
// @route   GET /api/dashboard/user/performance
// @access  Private/User
const getUserPerformance = async (req, res) => {
  try {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfYear = new Date(today.getFullYear(), 0, 1);

    const [daily, monthly, yearly, allTime, comparison] = await Promise.all([
      // Daily performance
      Sale.aggregate([
        {
          $match: {
            soldBy: req.user._id,
            createdAt: { $gte: new Date(today.setHours(0, 0, 0, 0)) },
          },
        },
        {
          $group: {
            _id: null,
            sales: { $sum: 1 },
            revenue: { $sum: "$total" },
            items: { $sum: { $size: "$items" } },
          },
        },
      ]),

      // Monthly performance
      Sale.aggregate([
        {
          $match: {
            soldBy: req.user._id,
            createdAt: { $gte: startOfMonth },
          },
        },
        {
          $group: {
            _id: null,
            sales: { $sum: 1 },
            revenue: { $sum: "$total" },
            items: { $sum: { $size: "$items" } },
          },
        },
      ]),

      // Yearly performance
      Sale.aggregate([
        {
          $match: {
            soldBy: req.user._id,
            createdAt: { $gte: startOfYear },
          },
        },
        {
          $group: {
            _id: null,
            sales: { $sum: 1 },
            revenue: { $sum: "$total" },
            items: { $sum: { $size: "$items" } },
          },
        },
      ]),

      // All time performance
      Sale.aggregate([
        { $match: { soldBy: req.user._id } },
        {
          $group: {
            _id: null,
            sales: { $sum: 1 },
            revenue: { $sum: "$total" },
            items: { $sum: { $size: "$items" } },
            uniqueCustomers: { $addToSet: "$customerPhone" },
          },
        },
      ]),

      // Comparison with other users
      Sale.aggregate([
        {
          $group: {
            _id: "$soldBy",
            revenue: { $sum: "$total" },
            sales: { $sum: 1 },
          },
        },
        { $sort: { revenue: -1 } },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "user",
          },
        },
        { $unwind: "$user" },
      ]),
    ]);

    const userRank =
      comparison.findIndex(
        (u) => u._id.toString() === req.user._id.toString(),
      ) + 1;
    const topPerformer = comparison[0];

    res.json({
      success: true,
      data: {
        daily: {
          sales: daily[0]?.sales || 0,
          revenue: daily[0]?.revenue || 0,
          items: daily[0]?.items || 0,
        },
        monthly: {
          sales: monthly[0]?.sales || 0,
          revenue: monthly[0]?.revenue || 0,
          items: monthly[0]?.items || 0,
        },
        yearly: {
          sales: yearly[0]?.sales || 0,
          revenue: yearly[0]?.revenue || 0,
          items: yearly[0]?.items || 0,
        },
        allTime: {
          sales: allTime[0]?.sales || 0,
          revenue: allTime[0]?.revenue || 0,
          items: allTime[0]?.items || 0,
          uniqueCustomers: allTime[0]?.uniqueCustomers?.length || 0,
        },
        ranking: {
          position: userRank,
          totalUsers: comparison.length,
          topPerformer: {
            name: topPerformer?.user.name,
            revenue: topPerformer?.revenue,
            gap: topPerformer?.revenue - (allTime[0]?.revenue || 0),
          },
        },
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
  getUserDashboard,
  getUserSalesHistory,
  getUserPerformance,
};
