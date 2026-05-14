const Stock = require("../models/Stock");
const Product = require("../models/Product");
const mongoose = require("mongoose");

// @desc    Get all stock movements with filters
// @route   GET /api/stocks
// @access  Private
const getStockMovements = async (req, res) => {
  try {
    const {
      productId,
      type,
      reference,
      startDate,
      endDate,
      page = 1,
      limit = 50,
    } = req.query;

    // Build filter object
    const filter = {};

    if (productId) filter.product = productId;
    if (type) filter.type = type;
    if (reference) filter.reference = reference;

    // Date range filter
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    const stocks = await Stock.find(filter)
      .populate("product", "name batchNumber genericName category")
      .populate("updatedBy", "name email")
      .sort("-createdAt")
      .skip(skip)
      .limit(limitNumber);

    const total = await Stock.countDocuments(filter);

    res.json({
      success: true,
      data: stocks,
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total,
        pages: Math.ceil(total / limitNumber),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get stock movement by ID
// @route   GET /api/stocks/:id
// @access  Private
const getStockMovementById = async (req, res) => {
  try {
    const stock = await Stock.findById(req.params.id)
      .populate(
        "product",
        "name batchNumber genericName manufacturer expiryDate",
      )
      .populate("updatedBy", "name email role");

    if (!stock) {
      return res.status(404).json({
        success: false,
        message: "Stock movement record not found",
      });
    }

    res.json({
      success: true,
      data: stock,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Add stock (purchase)
// @route   POST /api/stocks/add-stock
// @access  Private/Manager
const addStock = async (req, res) => {
  try {
    const {
      productId,
      quantity,
      purchasePrice,
      batchNumber,
      expiryDate,
      notes,
    } = req.body;

    // Validate input
    if (!productId || !quantity || quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: "Product ID and valid quantity are required",
      });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const oldQuantity = product.quantity;

    // Update product details
    product.quantity += parseInt(quantity);

    if (purchasePrice) {
      product.price.purchasePrice = purchasePrice;
    }

    if (batchNumber) {
      product.batchNumber = batchNumber;
    }

    if (expiryDate) {
      product.expiryDate = new Date(expiryDate);
    }

    await product.save();

    // Create stock movement record
    const stockMovement = await Stock.create({
      product: productId,
      previousQuantity: oldQuantity,
      newQuantity: product.quantity,
      quantityChanged: parseInt(quantity),
      type: "in",
      reference: "purchase",
      notes: notes || `Stock purchased - ${quantity} units added`,
      updatedBy: req.user._id,
    });

    res.status(201).json({
      success: true,
      message: "Stock added successfully",
      data: {
        product: {
          _id: product._id,
          name: product.name,
          quantity: product.quantity,
          batchNumber: product.batchNumber,
          expiryDate: product.expiryDate,
        },
        stockMovement,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Remove stock (damage, expiry, return to supplier)
// @route   POST /api/stocks/remove-stock
// @access  Private/Manager
const removeStock = async (req, res) => {
  try {
    const { productId, quantity, reason, reference, notes } = req.body;

    // Validate input
    if (!productId || !quantity || quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: "Product ID and valid quantity are required",
      });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    if (product.quantity < quantity) {
      return res.status(400).json({
        success: false,
        message: `Insufficient stock. Available: ${product.quantity}, Requested: ${quantity}`,
      });
    }

    const oldQuantity = product.quantity;
    product.quantity -= parseInt(quantity);
    await product.save();

    // Create stock movement record
    const stockMovement = await Stock.create({
      product: productId,
      previousQuantity: oldQuantity,
      newQuantity: product.quantity,
      quantityChanged: -parseInt(quantity),
      type: "out",
      reference: reference || "adjustment",
      notes:
        notes || `${reason || "Stock removal"} - ${quantity} units removed`,
      updatedBy: req.user._id,
    });

    res.json({
      success: true,
      message: "Stock removed successfully",
      data: {
        product: {
          _id: product._id,
          name: product.name,
          quantity: product.quantity,
        },
        stockMovement,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Transfer stock between products or locations
// @route   POST /api/stocks/transfer
// @access  Private/Manager
const transferStock = async (req, res) => {
  try {
    const { fromProductId, toProductId, quantity, notes } = req.body;

    if (!fromProductId || !toProductId || !quantity || quantity <= 0) {
      return res.status(400).json({
        success: false,
        message:
          "Source product, destination product, and valid quantity are required",
      });
    }

    const fromProduct = await Product.findById(fromProductId);
    if (!fromProduct) {
      return res.status(404).json({
        success: false,
        message: "Source product not found",
      });
    }

    const toProduct = await Product.findById(toProductId);
    if (!toProduct) {
      return res.status(404).json({
        success: false,
        message: "Destination product not found",
      });
    }

    if (fromProduct.quantity < quantity) {
      return res.status(400).json({
        success: false,
        message: `Insufficient stock in source product. Available: ${fromProduct.quantity}`,
      });
    }

    // Start session for transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Remove from source
      const fromOldQuantity = fromProduct.quantity;
      fromProduct.quantity -= parseInt(quantity);
      await fromProduct.save({ session });

      await Stock.create(
        [
          {
            product: fromProductId,
            previousQuantity: fromOldQuantity,
            newQuantity: fromProduct.quantity,
            quantityChanged: -parseInt(quantity),
            type: "out",
            reference: "transfer",
            notes: notes || `Transferred to ${toProduct.name}`,
            updatedBy: req.user._id,
          },
        ],
        { session },
      );

      // Add to destination
      const toOldQuantity = toProduct.quantity;
      toProduct.quantity += parseInt(quantity);
      await toProduct.save({ session });

      await Stock.create(
        [
          {
            product: toProductId,
            previousQuantity: toOldQuantity,
            newQuantity: toProduct.quantity,
            quantityChanged: parseInt(quantity),
            type: "in",
            reference: "transfer",
            notes: notes || `Received from ${fromProduct.name}`,
            updatedBy: req.user._id,
          },
        ],
        { session },
      );

      await session.commitTransaction();

      res.json({
        success: true,
        message: `Stock transferred successfully: ${quantity} units from ${fromProduct.name} to ${toProduct.name}`,
        data: {
          fromProduct: {
            _id: fromProduct._id,
            name: fromProduct.name,
            quantity: fromProduct.quantity,
          },
          toProduct: {
            _id: toProduct._id,
            name: toProduct.name,
            quantity: toProduct.quantity,
          },
        },
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get stock summary/dashboard
// @route   GET /api/stocks/summary
// @access  Private
const getStockSummary = async (req, res) => {
  try {
    // Total products count
    const totalProducts = await Product.countDocuments();

    // Total stock value
    const products = await Product.find();
    const totalStockValue = products.reduce(
      (sum, product) => sum + product.price.purchasePrice * product.quantity,
      0,
    );

    const totalSellingValue = products.reduce(
      (sum, product) => sum + product.price.sellingPrice * product.quantity,
      0,
    );

    // Low stock products
    const lowStockProducts = await Product.find({
      $expr: {
        $lte: ["$quantity", "$reorderLevel"],
      },
    });

    // Expired products
    const today = new Date();
    const expiredProducts = await Product.find({
      expiryDate: { $lt: today },
      quantity: { $gt: 0 },
    });

    // Expiring soon (next 30 days)
    const thirtyDaysLater = new Date();
    thirtyDaysLater.setDate(today.getDate() + 30);
    const expiringSoon = await Product.find({
      expiryDate: {
        $gte: today,
        $lte: thirtyDaysLater,
      },
      quantity: { $gt: 0 },
    });

    // Stock movements summary
    const last30Days = new Date();
    last30Days.setDate(today.getDate() - 30);

    const stockIn = await Stock.aggregate([
      {
        $match: {
          type: "in",
          createdAt: { $gte: last30Days },
        },
      },
      {
        $group: {
          _id: null,
          totalUnits: { $sum: "$quantityChanged" },
        },
      },
    ]);

    const stockOut = await Stock.aggregate([
      {
        $match: {
          type: "out",
          createdAt: { $gte: last30Days },
        },
      },
      {
        $group: {
          _id: null,
          totalUnits: { $sum: { $abs: "$quantityChanged" } },
        },
      },
    ]);

    res.json({
      success: true,
      data: {
        summary: {
          totalProducts,
          totalStockValue: totalStockValue.toFixed(2),
          totalSellingValue: totalSellingValue.toFixed(2),
          potentialProfit: (totalSellingValue - totalStockValue).toFixed(2),
        },
        alerts: {
          lowStock: {
            count: lowStockProducts.length,
            products: lowStockProducts.map((p) => ({
              _id: p._id,
              name: p.name,
              quantity: p.quantity,
              reorderLevel: p.reorderLevel,
            })),
          },
          expired: {
            count: expiredProducts.length,
            products: expiredProducts.map((p) => ({
              _id: p._id,
              name: p.name,
              quantity: p.quantity,
              expiryDate: p.expiryDate,
            })),
          },
          expiringSoon: {
            count: expiringSoon.length,
            products: expiringSoon.map((p) => ({
              _id: p._id,
              name: p.name,
              quantity: p.quantity,
              expiryDate: p.expiryDate,
              daysLeft: Math.ceil(
                (p.expiryDate - today) / (1000 * 60 * 60 * 24),
              ),
            })),
          },
        },
        movements: {
          last30Days: {
            stockIn: stockIn[0]?.totalUnits || 0,
            stockOut: stockOut[0]?.totalUnits || 0,
            netChange:
              (stockIn[0]?.totalUnits || 0) - (stockOut[0]?.totalUnits || 0),
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

// @desc    Get stock by product
// @route   GET /api/stocks/product/:productId
// @access  Private
const getProductStockHistory = async (req, res) => {
  try {
    const { productId } = req.params;
    const { limit = 20 } = req.query;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const stockHistory = await Stock.find({ product: productId })
      .populate("updatedBy", "name")
      .sort("-createdAt")
      .limit(parseInt(limit));

    // Calculate average daily movement
    const movements = await Stock.aggregate([
      {
        $match: { product: new mongoose.Types.ObjectId(productId) },
      },
      {
        $group: {
          _id: {
            type: "$type",
            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          },
          totalQuantity: { $sum: "$quantityChanged" },
        },
      },
    ]);

    res.json({
      success: true,
      data: {
        product: {
          _id: product._id,
          name: product.name,
          currentQuantity: product.quantity,
          reorderLevel: product.reorderLevel,
          batchNumber: product.batchNumber,
          expiryDate: product.expiryDate,
        },
        stockHistory,
        movementSummary: movements,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Adjust stock (manual adjustment)
// @route   PUT /api/stocks/adjust/:productId
// @access  Private/Manager
const adjustStock = async (req, res) => {
  try {
    const { productId } = req.params;
    const { newQuantity, reason, notes } = req.body;

    if (newQuantity === undefined || newQuantity < 0) {
      return res.status(400).json({
        success: false,
        message: "Valid new quantity is required",
      });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const oldQuantity = product.quantity;
    const quantityChanged = newQuantity - oldQuantity;

    product.quantity = newQuantity;
    await product.save();

    // Create stock adjustment record
    const stockMovement = await Stock.create({
      product: productId,
      previousQuantity: oldQuantity,
      newQuantity: newQuantity,
      quantityChanged: quantityChanged,
      type: quantityChanged >= 0 ? "in" : "out",
      reference: "adjustment",
      notes:
        notes ||
        `Manual adjustment: ${reason || "Stock updated"}. Changed from ${oldQuantity} to ${newQuantity}`,
      updatedBy: req.user._id,
    });

    res.json({
      success: true,
      message: `Stock adjusted from ${oldQuantity} to ${newQuantity}`,
      data: {
        product: {
          _id: product._id,
          name: product.name,
          oldQuantity,
          newQuantity,
          difference: quantityChanged,
        },
        stockMovement,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get stock report
// @route   GET /api/stocks/report
// @access  Private/Manager
const getStockReport = async (req, res) => {
  try {
    const { startDate, endDate, groupBy = "day" } = req.query;

    const matchStage = {};
    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) matchStage.createdAt.$gte = new Date(startDate);
      if (endDate) matchStage.createdAt.$lte = new Date(endDate);
    }

    let dateFormat;
    switch (groupBy) {
      case "month":
        dateFormat = "%Y-%m";
        break;
      case "week":
        dateFormat = "%Y-%U";
        break;
      default:
        dateFormat = "%Y-%m-%d";
    }

    const report = await Stock.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: dateFormat, date: "$createdAt" } },
            type: "$type",
            reference: "$reference",
          },
          totalUnits: { $sum: { $abs: "$quantityChanged" } },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: {
            date: "$_id.date",
            type: "$_id.type",
          },
          references: {
            $push: {
              reference: "$_id.reference",
              totalUnits: "$totalUnits",
              count: "$count",
            },
          },
          totalUnits: { $sum: "$totalUnits" },
          totalTransactions: { $sum: "$count" },
        },
      },
      { $sort: { "_id.date": 1 } },
    ]);

    // Get top moving products
    const topProducts = await Stock.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: "$product",
          totalMovements: { $sum: { $abs: "$quantityChanged" } },
          inCount: {
            $sum: {
              $cond: [
                { $eq: ["$type", "in"] },
                { $abs: "$quantityChanged" },
                0,
              ],
            },
          },
          outCount: {
            $sum: {
              $cond: [
                { $eq: ["$type", "out"] },
                { $abs: "$quantityChanged" },
                0,
              ],
            },
          },
        },
      },
      { $sort: { totalMovements: -1 } },
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
    ]);

    res.json({
      success: true,
      data: {
        timeline: report,
        topProducts: topProducts.map((p) => ({
          productId: p.product._id,
          productName: p.product.name,
          totalMovements: p.totalMovements,
          inCount: p.inCount,
          outCount: p.outCount,
        })),
        summary: {
          totalIn: report
            .filter((r) => r._id.type === "in")
            .reduce((sum, r) => sum + r.totalUnits, 0),
          totalOut: report
            .filter((r) => r._id.type === "out")
            .reduce((sum, r) => sum + r.totalUnits, 0),
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
  getStockMovements,
  getStockMovementById,
  addStock,
  removeStock,
  transferStock,
  getStockSummary,
  getProductStockHistory,
  adjustStock,
  getStockReport,
};
