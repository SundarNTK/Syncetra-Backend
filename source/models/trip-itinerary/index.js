const mongoose = require("mongoose");
const db = require("../../utilities/constants/db-name");
const { TypeString, TypeBoolean, TypeNumber } = require("../../utilities/types");

const itinerarySchema = new mongoose.Schema(
  {
    tripId: { type: mongoose.Schema.Types.ObjectId, ref: db.trips, required: true },
    pointName: { ...TypeString, required: true },
    locationName: TypeString,
    description: TypeString,
    visitDate: Date,
    visitTime: TypeString,
    duration: TypeString,
    notes: TypeString,
    sequenceOrder: { type: Number, default: 0 },
    orderNo: { ...TypeNumber, default: 0 },
    isReached: { ...TypeBoolean, default: false },
    images: [{ type: String }],
    location: {
      lat: { type: Number },
      lng: { type: Number },
      name: { type: String },
      url: { type: String },
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: db.users },
    isDeleted: { ...TypeBoolean, default: false },
  },
  { versionKey: false, timestamps: true, collection: db.itinerary }
);

itinerarySchema.index({ tripId: 1, sequenceOrder: 1 });

module.exports = mongoose.model(db.itinerary, itinerarySchema);
