const mongoose = require("mongoose");
const db = require("../../utilities/constants/db-name");
const { TypeString, TypeBoolean, TypeNumber } = require("../../utilities/types");

const transactionSchema = new mongoose.Schema(
  {
    paymentDate: Date,
    paymentAmount: { type: Number, default: 0 },
    paymentMode: { type: String, enum: ["online", "offline"], default: "offline" },
    transactionRef: TypeString,
    remarks: TypeString,
    collectedBy: { type: mongoose.Schema.Types.ObjectId, ref: db.users },
  },
  { _id: true, timestamps: true }
);

const shareCollectionSchema = new mongoose.Schema(
  {
    tripId: { type: mongoose.Schema.Types.ObjectId, ref: db.trips, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: db.users, required: true },
    totalShareAmount: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0 },
    pendingAmount: { type: Number, default: 0 },
    paymentStatus: {
      type: String,
      enum: ["pending", "partial", "paid"],
      default: "pending",
    },
    transactions: [transactionSchema],
    isDeleted: { ...TypeBoolean, default: false },
  },
  { versionKey: false, timestamps: true, collection: db.shareCollection }
);

shareCollectionSchema.index({ tripId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model(db.shareCollection, shareCollectionSchema);
