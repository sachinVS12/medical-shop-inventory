const Sale = require("../models/Sale");
const Product = require("../models/Product");
const Stock = require("../models/Stock");

// Generate invoice number
const generateInvoiceNumber = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const random = Math.floor(Math.random() * 10000);
  return `INV-${year}${month}-${random}`;
};

// @desc    Create a sale
// @route   POST /api/sales
// @access  Private
const createSale = async (req, res) => {
  try {
    const {
      items,
      customerName,
      customerPhone,
      paymentMethod,
      discount,
      tax,
      prescriptionImage,
    } = req.body;

    // Check stock availability
    for (const item of items) {
      const product = await Product.findById(item.product);
      if (!product) {
        return res
          .status(404)
          .json({ message: `Product ${item.product} not found` });
      }
      if (product.quantity < item.quantity) {
        return res
          .status(400)
          .json({
            message: `Insufficient stock for ${product.name}. Available: ${product.quantity}`,
          });
      }
    }

    let subtotal = 0;
    const saleItems = [];

    // Calculate totals and prepare items
    for (const item of items) {
      const product = await Product.findById(item.product);
      const total = product.price.sellingPrice * item.quantity;
      subtotal += total;
      saleItems.push({
        product: item.product,
        quantity: item.quantity,
        price: product.price.sellingPrice,
        total: total,
      });
    }

    const total = subtotal - (discount || 0) + (tax || 0);

    const sale = await Sale.create({
      invoiceNumber: generateInvoiceNumber(),
      items: saleItems,
      subtotal,
      discount: discount || 0,
      tax: tax || 0,
      total,
      customerName,
      customerPhone,
      paymentMethod,
      prescriptionImage,
      soldBy: req.user._id,
    });

    // Update stock and create stock entries
    for (const item of saleItems) {
      const product = await Product.findById(item.product);
      const oldQuantity = product.quantity;
      product.quantity -= item.quantity;
      await product.save();

      await Stock.create({
        product: product._id,
        previousQuantity: oldQuantity,
        newQuantity: product.quantity,
        quantityChanged: -item.quantity,
        type: "out",
        reference: "sale",
        referenceId: sale._id,
        updatedBy: req.user._id,
      });
    }

    res.status(201).json(sale);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all sales
// @route   GET /api/sales
// @access  Private
const getSales = async (req, res) => {
  try {
    const sales = await Sale.find()
      .populate("items.product", "name batchNumber")
      .populate("soldBy", "name")
      .sort("-createdAt");
    res.json(sales);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get sale by ID
// @route   GET /api/sales/:id
// @access  Private
const getSaleById = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id)
      .populate("items.product", "name batchNumber manufacturer")
      .populate("soldBy", "name");

    if (!sale) {
      return res.status(404).json({ message: "Sale not found" });
    }

    res.json(sale);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get sales report
// @route   GET /api/sales/report
// @access  Private/Manager
const getSalesReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const query = {};

    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const sales = await Sale.find(query);
    const totalSales = sales.length;
    const totalRevenue = sales.reduce((sum, sale) => sum + sale.total, 0);
    const totalItems = sales.reduce(
      (sum, sale) =>
        sum + sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
      0,
    );

    res.json({
      totalSales,
      totalRevenue,
      totalItems,
      sales,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { createSale, getSales, getSaleById, getSalesReport };
