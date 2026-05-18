const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const testConnection = async () => {
  try {
    // Test database connection
    console.log("Testing database connection...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Database connected successfully");

    // List all collections
    const collections = await mongoose.connection.db
      .listCollections()
      .toArray();
    console.log(
      "📚 Collections in database:",
      collections.map((c) => c.name),
    );

    // Get database stats
    const stats = await mongoose.connection.db.stats();
    console.log("📊 Database stats:", {
      collections: stats.collections,
      objects: stats.objects,
      dataSize: (stats.dataSize / 1024 / 1024).toFixed(2) + " MB",
    });

    await mongoose.disconnect();
    console.log("✅ Test completed successfully");
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
};

testConnection();
