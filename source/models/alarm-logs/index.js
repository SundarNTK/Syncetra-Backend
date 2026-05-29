const mongoose = require("mongoose");
const db = require("../../utilities/constants/db-name");
const { TypeString, TypeDate } = require("../../utilities/types");

const alarmLogSchema = new mongoose.Schema(
  {
    alarmId: { type: mongoose.Schema.Types.ObjectId, ref: db.alarms, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: db.users, required: true },
    slotId: TypeString,
    stoppedAt: TypeDate,
    enteredCode: TypeString,
    status: {
      ...TypeString,
      enum: ["pending", "stopped", "failed"],
      default: "pending",
    },
  },
  { timestamps: true, collection: db.alarmLogs }
);

alarmLogSchema.index({ alarmId: 1, userId: 1 });

module.exports = mongoose.model(db.alarmLogs, alarmLogSchema);
