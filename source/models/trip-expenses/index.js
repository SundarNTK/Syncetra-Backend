const mongoose = require("mongoose");
const db = require("../../utilities/constants/db-name");
const { TypeString, TypeNumber, TypeBoolean } = require("../../utilities/types");

const expenseSchema = new mongoose.Schema(
  {
    tripId: { type: mongoose.Schema.Types.ObjectId, ref: db.trips, required: true },
    category: { ...TypeString, required: true },
    amount: { ...TypeNumber, required: true },
    description: TypeString,
    splitType: {
      ...TypeString,
      enum: ["all", "selected", "vehicle"],
      default: "all",
    },
    splitAmong: [{ type: mongoose.Schema.Types.ObjectId, ref: db.users }],
    vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: db.vehicles },
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: db.users },
    fundSource: {
      ...TypeString,
      enum: ["shareCollection", "sponsor"],
      default: "shareCollection",
    },
    paymentStatus: {
      ...TypeString,
      enum: ["pending", "paid", "partial"],
      default: "pending",
    },
    imageUrl: TypeString,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: db.users },
    isDeleted: { ...TypeBoolean, default: false },
  },
  { versionKey: false, timestamps: true, collection: db.expenses }
);

expenseSchema.index({ tripId: 1 });

module.exports = mongoose.model(db.expenses, expenseSchema);
