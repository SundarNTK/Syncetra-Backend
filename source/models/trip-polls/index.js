const mongoose = require("mongoose");
const db = require("../../utilities/constants/db-name");
const { TypeString, TypeBoolean } = require("../../utilities/types");

const pollSchema = new mongoose.Schema(
  {
    tripId: { type: mongoose.Schema.Types.ObjectId, ref: db.trips, required: true },
    question: { ...TypeString, required: true },
    pollType: {
      ...TypeString,
      enum: ["food", "route", "departure", "emergency", "general"],
      default: "general",
    },
    options: [{ label: TypeString, votes: [{ type: mongoose.Schema.Types.ObjectId, ref: db.users }] }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: db.users },
    isClosed: { ...TypeBoolean, default: false },
    isDeleted: { ...TypeBoolean, default: false },
  },
  { versionKey: false, timestamps: true, collection: db.polls }
);

pollSchema.index({ tripId: 1 });

module.exports = mongoose.model(db.polls, pollSchema);
