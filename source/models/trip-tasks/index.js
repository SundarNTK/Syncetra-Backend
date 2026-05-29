const mongoose = require("mongoose");
const db = require("../../utilities/constants/db-name");
const { TypeString, TypeBoolean } = require("../../utilities/types");

const acknowledgmentSchema = new mongoose.Schema(
  {
    userId:     { type: mongoose.Schema.Types.ObjectId, ref: db.users, required: true },
    status:      { type: String, enum: ["pending", "accepted", "refused"], default: "pending" },
    comment:     { type: String, default: "" },
    acceptedAt:  { type: Date, default: null },
    respondedAt: { type: Date, default: null },
  },
  { _id: false }
);

const taskSchema = new mongoose.Schema(
  {
    tripId:          { type: mongoose.Schema.Types.ObjectId, ref: db.trips, required: true },
    title:           { ...TypeString, required: true },
    description:     TypeString,
    assignedTo:      [{ type: mongoose.Schema.Types.ObjectId, ref: db.users }],
    acknowledgments: [acknowledgmentSchema],
    status: {
      ...TypeString,
      enum: ["pending", "in_progress", "completed"],
      default: "pending",
    },
    createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: db.users },
    isDeleted:  { ...TypeBoolean, default: false },
  },
  { timestamps: true, collection: db.tasks }
);

taskSchema.index({ tripId: 1 });
taskSchema.index({ assignedTo: 1 });

module.exports = mongoose.model(db.tasks, taskSchema);
