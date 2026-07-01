const mongoose = require("mongoose");
const db = require("../../utilities/constants/db-name");
const { TypeString, TypeBoolean, TypeNumber } = require("../../utilities/types");

const mealSchema = {
  available: { ...TypeBoolean, default: false },
  menu: [TypeString],
  perPersonCost: { ...TypeNumber, default: 0 },
};

const hotelSchema = new mongoose.Schema(
  {
    tripId: { type: mongoose.Schema.Types.ObjectId, ref: db.trips, required: true },
    hotelName: { ...TypeString, required: true },
    locationName: TypeString,
    mapLink: TypeString,
    latitude: TypeNumber,
    longitude: TypeNumber,
    images: [TypeString],
    videos: [TypeString],
    perDayCost: { ...TypeNumber, default: 0 },
    advanceAmount: { ...TypeNumber, default: 0 },
    advancePaid: { ...TypeBoolean, default: false },
    paymentCompleted: { ...TypeBoolean, default: false },
    checkInAt: Date,
    checkOutAt: Date,
    roomsCount: { ...TypeNumber, default: 1 },
    bedsCount: { ...TypeNumber, default: 1 },
    bedType: {
      ...TypeString,
      enum: ["single", "double", "twin", "queen", "king", "bunk"],
      default: "double",
    },
    complimentary: [
      {
        name: TypeString,
        imageUrl: TypeString,
      },
    ],
    foodDetails: {
      breakfast: mealSchema,
      lunch: mealSchema,
      dinner: mealSchema,
    },
    notes: TypeString,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: db.users },
    isDeleted: { ...TypeBoolean, default: false },
  },
  { versionKey: false, timestamps: true, collection: db.hotels }
);

hotelSchema.index({ tripId: 1 });

module.exports = mongoose.model(db.hotels, hotelSchema);
