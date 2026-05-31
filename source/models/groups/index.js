const mongoose = require("mongoose");
const db = require("../../utilities/constants/db-name");
const { TypeString, TypeBoolean } = require("../../utilities/types");

const groupSchema = new mongoose.Schema(
  {
    groupName: { ...TypeString, required: true },
    tripId: { type: mongoose.Schema.Types.ObjectId, ref: db.trips, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: db.users, required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: db.users }],
    isDeleted: { ...TypeBoolean, default: false },
  },
  { versionKey: false, timestamps: true, collection: db.groups }
);

groupSchema.index({ createdBy: 1 });
groupSchema.index({ members: 1 });

module.exports = mongoose.model(db.groups, groupSchema);
