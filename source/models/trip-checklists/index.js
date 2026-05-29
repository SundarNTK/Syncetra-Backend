const mongoose = require("mongoose");
const db = require("../../utilities/constants/db-name");
const { TypeString, TypeBoolean } = require("../../utilities/types");

const checklistSchema = new mongoose.Schema(
  {
    tripId: { type: mongoose.Schema.Types.ObjectId, ref: db.trips, required: true },
    item: { ...TypeString, required: true },
    /** Optional image (URL or data URL) shown in checklist UI */
    imageUrl: { ...TypeString, default: "" },
    description: { ...TypeString, default: "" },
    /** Empty = visible to all trip members; otherwise only listed users */
    assignedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: db.users }],
    packedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: db.users }],
    isAdminItem: { ...TypeBoolean, default: false },
    isDeleted: { ...TypeBoolean, default: false },
  },
  { timestamps: true, collection: db.checklists }
);

checklistSchema.index({ tripId: 1 });

module.exports = mongoose.model(db.checklists, checklistSchema);
