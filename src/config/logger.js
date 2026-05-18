const mongoose = require("mongoose");

// Suppress mongoose warnings (optional)
mongoose.set("strictQuery", true);

// Enable debug mode only in development
if (process.env.NODE_ENV === "development") {
  mongoose.set("debug", true);
}

module.exports = mongoose;
