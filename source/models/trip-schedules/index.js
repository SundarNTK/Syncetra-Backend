const mongoose = require("mongoose");
const db = require("../../utilities/constants/db-name");
const { TypeString, TypeBoolean } = require("../../utilities/types");

const scheduleSchema = new mongoose.Schema(
  {
    tripId: { type: mongoose.Schema.Types.ObjectId, ref: db.trips, required: true },
    title: { ...TypeString, required: true },
    checkpoint: TypeString,
    scheduledAt: Date,
    notes: TypeString,
    isDeleted: { ...TypeBoolean, default: false },
  },
  { versionKey: false, timestamps: true, collection: db.schedules }
);

scheduleSchema.index({ tripId: 1 });

module.exports = mongoose.model(db.schedules, scheduleSchema);
