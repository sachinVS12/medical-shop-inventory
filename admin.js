const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const User = require("./src/models/User");

const createAdminUser = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to database");

    // Check if any user exists
    const userCount = await User.countDocuments();

    if (userCount === 0) {
      // Create admin user                  // node admin.js
      const admin = await User.create({
        name: "Admin User",
        email: "admin@medicalshop.com",
        password: "Admin@123",
        role: "manager",
      });

      console.log("✅ Admin user created successfully!");
      console.log("Email: admin@medicalshop.com");
      console.log("Password: Admin@123");
      console.log("Role: Manager");
    } else {
      console.log("Users already exist in the database");
      const users = await User.find().select("-password");
      console.log("Existing users:", users);
    }

    await mongoose.disconnect();
    console.log("Database disconnected");
  } catch (error) {
    console.error("Error:", error.message);
    await mongoose.disconnect();
  }
};

createAdminUser();
