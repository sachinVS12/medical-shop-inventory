const Category = require("../models/Category");
const Product = require("../models/Product");

// @desc    Create a new category
// @route   POST /api/categories
// @access  Private/Manager
const createCategory = async (req, res) => {
  try {
    const { name, description } = req.body;

    // Check if category already exists
    const categoryExists = await Category.findOne({ name: name.toLowerCase() });
    if (categoryExists) {
      return res.status(400).json({
        success: false,
        message: "Category with this name already exists",
      });
    }

    // Create category
    const category = await Category.create({
      name: name.toLowerCase(),
      description,
      createdBy: req.user._id,
    });

    res.status(201).json({
      success: true,
      data: category,
      message: "Category created successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get all categories
// @route   GET /api/categories
// @access  Private
const getCategories = async (req, res) => {
  try {
    const categories = await Category.find()
      .populate("createdBy", "name email")
      .sort("-createdAt");

    // Get product count for each category
    const categoriesWithCount = await Promise.all(
      categories.map(async (category) => {
        const productCount = await Product.countDocuments({
          category: category._id,
        });
        return {
          ...category.toObject(),
          productCount,
        };
      }),
    );

    res.json({
      success: true,
      count: categories.length,
      data: categoriesWithCount,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get single category by ID
// @route   GET /api/categories/:id
// @access  Private
const getCategoryById = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id).populate(
      "createdBy",
      "name email",
    );

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    // Get products in this category
    const products = await Product.find({ category: category._id })
      .select("name batchNumber quantity price.sellingPrice expiryDate")
      .limit(10);

    res.json({
      success: true,
      data: {
        ...category.toObject(),
        products,
        productCount: products.length,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Update category
// @route   PUT /api/categories/:id
// @access  Private/Manager
const updateCategory = async (req, res) => {
  try {
    const { name, description } = req.body;

    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    // Check if new name already exists (if name is being changed)
    if (name && name.toLowerCase() !== category.name) {
      const nameExists = await Category.findOne({
        name: name.toLowerCase(),
        _id: { $ne: req.params.id },
      });

      if (nameExists) {
        return res.status(400).json({
          success: false,
          message: "Category with this name already exists",
        });
      }
    }

    // Update category
    category.name = name ? name.toLowerCase() : category.name;
    category.description =
      description !== undefined ? description : category.description;

    const updatedCategory = await category.save();

    res.json({
      success: true,
      data: updatedCategory,
      message: "Category updated successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Delete category
// @route   DELETE /api/categories/:id
// @access  Private/Manager
const deleteCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    // Check if category has products
    const productCount = await Product.countDocuments({
      category: category._id,
    });

    if (productCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete category. It has ${productCount} products associated with it. Please reassign or delete the products first.`,
      });
    }

    await category.deleteOne();

    res.json({
      success: true,
      message: "Category deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Search categories
// @route   GET /api/categories/search?q=:term
// @access  Private
const searchCategories = async (req, res) => {
  try {
    const searchTerm = req.query.q;

    if (!searchTerm) {
      return res.status(400).json({
        success: false,
        message: "Search term is required",
      });
    }

    const categories = await Category.find({
      name: { $regex: searchTerm, $options: "i" },
    }).populate("createdBy", "name");

    res.json({
      success: true,
      count: categories.length,
      data: categories,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get category statistics
// @route   GET /api/categories/stats
// @access  Private/Manager
const getCategoryStats = async (req, res) => {
  try {
    const categories = await Category.find();

    const stats = await Promise.all(
      categories.map(async (category) => {
        const products = await Product.find({ category: category._id });
        const totalProducts = products.length;
        const totalValue = products.reduce(
          (sum, product) => sum + product.price.sellingPrice * product.quantity,
          0,
        );
        const lowStockProducts = products.filter(
          (p) => p.quantity <= p.reorderLevel,
        ).length;

        return {
          categoryId: category._id,
          categoryName: category.name,
          totalProducts,
          totalValue,
          lowStockProducts,
          averagePrice: totalProducts > 0 ? totalValue / totalProducts : 0,
        };
      }),
    );

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Bulk delete categories
// @route   DELETE /api/categories/bulk
// @access  Private/Manager
const bulkDeleteCategories = async (req, res) => {
  try {
    const { categoryIds } = req.body;

    if (
      !categoryIds ||
      !Array.isArray(categoryIds) ||
      categoryIds.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide category IDs to delete",
      });
    }

    // Check if any category has products
    const categoriesWithProducts = await Promise.all(
      categoryIds.map(async (id) => {
        const productCount = await Product.countDocuments({ category: id });
        return { id, hasProducts: productCount > 0 };
      }),
    );

    const invalidCategories = categoriesWithProducts.filter(
      (c) => c.hasProducts,
    );

    if (invalidCategories.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete ${invalidCategories.length} categories because they have products associated.`,
      });
    }

    const result = await Category.deleteMany({ _id: { $in: categoryIds } });

    res.json({
      success: true,
      message: `${result.deletedCount} categories deleted successfully`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  createCategory,
  getCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
  searchCategories,
  getCategoryStats,
  bulkDeleteCategories,
};
