const mongoose = require("mongoose");
const db = require("../../utilities/constants/db-name");
const { TypeString, TypeBoolean, TypeNumber } = require("../../utilities/types");

const vehicleSchema = new mongoose.Schema(
  {
    tripId: { type: mongoose.Schema.Types.ObjectId, ref: db.trips, required: true },
    name: { ...TypeString, required: true },
    type: {
      ...TypeString,
      enum: ["bus", "van", "car", "bike", "tempo_traveller", "auto", "jeep", "minibus"],
      default: "car",
    },
    plateNumber: TypeString,
    totalSeats: { ...TypeNumber, default: 4 },
    images: [TypeString],
    bookedDate: Date,
    advanceAmount: { ...TypeNumber, default: 0 },
    totalAmount: { ...TypeNumber, default: 0 },
    tripStartDate: Date,
    tripEndDate: Date,
    seatMap: [
      {
        seatNo: TypeString,
        userId: { type: mongoose.Schema.Types.ObjectId, ref: db.users },
      },
    ],
    departureAt: Date,
    isDeleted: { ...TypeBoolean, default: false },
  },
  { versionKey: false, timestamps: true, collection: db.vehicles }
);

vehicleSchema.index({ tripId: 1 });

module.exports = mongoose.model(db.vehicles, vehicleSchema);
