const mongoose = require("mongoose");
const db = require("../../utilities/constants/db-name");
const { TypeString, TypeBoolean } = require("../../utilities/types");

const syncSchema = new mongoose.Schema(
  {
    tripId: { type: mongoose.Schema.Types.ObjectId, ref: db.trips, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: db.users, required: true },
    isOnline: { ...TypeBoolean, default: false },
    lastActiveAt: Date,
    alarmReceived: { ...TypeBoolean, default: false },
    alarmOpened: { ...TypeBoolean, default: false },
    alarmStopped: { ...TypeBoolean, default: false },
    lastAlarmId: { type: mongoose.Schema.Types.ObjectId, ref: db.alarms },
    hasFcmToken: { ...TypeBoolean, default: false },
  },
  { versionKey: false, timestamps: true, collection: db.memberSync }
);

syncSchema.index({ tripId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model(db.memberSync, syncSchema);
