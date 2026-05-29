const mongoose = require("mongoose");
const db = require("../../utilities/constants/db-name");
const { TypeString, TypeBoolean } = require("../../utilities/types");

const attendanceSchema = new mongoose.Schema(
  {
    tripId: { type: mongoose.Schema.Types.ObjectId, ref: db.trips, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: db.users, required: true },
    status: {
      ...TypeString,
      enum: ["present", "late", "absent", "checked_out"],
      default: "present",
    },
    checkpoint: { ...TypeString, default: "Trip Start" },
    markedAt: Date,
    checkInAt: Date,
    checkOutAt: Date,
    note: TypeString,
    isDeleted: { ...TypeBoolean, default: false },
  },
  { timestamps: true, collection: db.attendance }
);

attendanceSchema.index({ tripId: 1, userId: 1, checkpoint: 1 });

module.exports = mongoose.model(db.attendance, attendanceSchema);
