const mongoose = require("mongoose");

const stockSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    previousQuantity: {
      type: Number,
      required: true,
    },
    newQuantity: {
      type: Number,
      required: true,
    },
    quantityChanged: {
      type: Number,
      required: true,
    },
    type: {
      type: String,
      enum: ["in", "out"],
      required: true,
    },
    reference: {
      type: String,
      enum: ["purchase", "sale", "adjustment", "return"],
      required: true,
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    notes: {
      type: String,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Stock", stockSchema);
