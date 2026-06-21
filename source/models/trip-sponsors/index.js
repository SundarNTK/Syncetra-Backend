const mongoose = require("mongoose");
const db = require("../../utilities/constants/db-name");
const { TypeString, TypeNumber, TypeBoolean } = require("../../utilities/types");

const sponsorSchema = new mongoose.Schema(
  {
    tripId:      { type: mongoose.Schema.Types.ObjectId, ref: db.trips, required: true },
    sponsorName: { ...TypeString, required: true },
    amount:      { ...TypeNumber, required: true },
    notes:       TypeString,
    imageUrl:    TypeString,
    createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: db.users },
    isDeleted:   { ...TypeBoolean, default: false },
  },
  { versionKey: false, timestamps: true, collection: db.sponsors }
);

sponsorSchema.index({ tripId: 1 });

module.exports = mongoose.model(db.sponsors, sponsorSchema);
