const mongoose = require("mongoose");
const db = require("../../utilities/constants/db-name");
const { TypeString, TypeBoolean, TypeNumber } = require("../../utilities/types");

const tripSchema = new mongoose.Schema(
  {
    tripName: { ...TypeString, required: true },
    description: TypeString,
    coverImage: TypeString,
    startDate: Date,
    endDate: Date,
    budget: { ...TypeNumber, default: 0 },
    collectedAmount: { ...TypeNumber, default: 0 },
    tripType: {
      ...TypeString,
      enum: ["group", "adventure", "family", "solo", "beach", "mountain", "road_trip", "business", "cultural", "religious", "other"],
      default: "group",
    },
    status: {
      ...TypeString,
      enum: ["planned", "active", "completed", "cancelled"],
      default: "planned",
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: db.users, required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: db.users }],
    locationName: TypeString,
    latitude: TypeNumber,
    longitude: TypeNumber,
    mapLink: TypeString,
    isDeleted: { ...TypeBoolean, default: false },
  },
  { timestamps: true, collection: db.trips }
);

tripSchema.index({ createdBy: 1 });
tripSchema.index({ members: 1 });

module.exports = mongoose.model(db.trips, tripSchema);
