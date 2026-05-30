const mongoose = require("mongoose");
const db = require("../../utilities/constants/db-name");
const { TypeString, TypeBoolean, TypeDate } = require("../../utilities/types");

const timeSlotSchema = new mongoose.Schema(
  {
    slotId: { ...TypeString, required: true },
    time: { ...TypeString, required: true },
    status: {
      ...TypeString,
      enum: ["active", "inactive"],
      default: "active",
    },
    triggered: { ...TypeBoolean, default: false },
    triggeredAt: TypeDate,
  },
  { _id: false }
);

const dateScheduleSchema = new mongoose.Schema(
  {
    date: { ...TypeString, required: true },
    status: {
      ...TypeString,
      enum: ["active", "inactive"],
      default: "active",
    },
    times: [timeSlotSchema],
  },
  { _id: false }
);

const alarmSchema = new mongoose.Schema(
  {
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: db.groups,
      required: true,
    },
    title: { ...TypeString, required: true },
    description: TypeString,
    schedules: [dateScheduleSchema],
    alarmTime: TypeDate,
    stopCode: { ...TypeString, required: true },
    repeatType: {
      ...TypeString,
      enum: ["none", "daily", "weekly"],
      default: "none",
    },
    status: {
      ...TypeString,
      enum: ["scheduled", "active", "completed", "cancelled"],
      default: "scheduled",
    },
    activeSlotId: TypeString,
    soundType: {
      ...TypeString,
      enum: ["beep", "siren", "urgent", "chime"],
      default: "siren",
    },
    isEmergency: { ...TypeBoolean, default: false },
    targetType: {
      ...TypeString,
      enum: ["group_all", "trip_all", "selected"],
      default: "group_all",
    },
    targetMemberIds: [{ type: mongoose.Schema.Types.ObjectId, ref: db.users }],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: db.users,
      required: true,
    },
    triggeredAt: TypeDate,
    isDeleted: { ...TypeBoolean, default: false },
  },
  { timestamps: true, collection: db.alarms }
);

alarmSchema.index({ alarmTime: 1, status: 1 });
alarmSchema.index({ groupId: 1, status: 1 });
alarmSchema.index({ "schedules.date": 1, status: 1 });

module.exports = mongoose.model(db.alarms, alarmSchema);
