const mongoose = require("mongoose");

const limitOrderSchema = new mongoose.Schema({
  size: { type: Number, required: true },
  price: { type: Number, required: true },
  persistenceType: { type: String, enum: ["LAPSE", "PERSIST"], required: true }
});

const instructionSchema = new mongoose.Schema({
  selectionId: { type: Number, required: true },
  handicap: { type: Number, required: true },
  limitOrder: { type: limitOrderSchema, required: true },
  customerOrderRef: { type: String, required: true },
  orderType: { type: String, required: true },
  side: { type: String, required: true },
  betId: { type: String, required: true, unique: true },
  placedDate: { type: Date, default: Date.now },
  sizeMatched: { type: Number},
  sizeRemaining: { type: Number},
  averagePriceMatched: { type: Number},
  orderStatus: { type: String, enum: ["EXECUTION_COMPLETE", "EXECUTABLE"], default: "EXECUTION_COMPLETE" }
});

const betSchema = new mongoose.Schema({
  marketId: { type: String, required: true },
  customerRef: { type: String, required: true },
  instructions: [instructionSchema],
  matchVersion: { type: Number, default: 0 },
  cancelled: { type: Boolean },
  
}, { timestamps: true });

module.exports = mongoose.model("Bet", betSchema);
