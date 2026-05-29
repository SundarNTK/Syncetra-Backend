const mongoose = require("mongoose");
const db = require("../../utilities/constants/db-name");
const { TypeString, TypeBoolean } = require("../../utilities/types");

const mediaSchema = new mongoose.Schema(
  {
    tripId: { type: mongoose.Schema.Types.ObjectId, ref: db.trips, required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: db.users, required: true },
    url: { ...TypeString, required: true },
    mediaType: { ...TypeString, enum: ["image", "video"], default: "image" },
    category: {
      ...TypeString,
      enum: ["food", "travel", "moments", "other"],
      default: "moments",
    },
    thumbUrl: TypeString,
    caption: TypeString,
    fileName: TypeString,
    isDeleted: { ...TypeBoolean, default: false },
  },
  { timestamps: true, collection: db.media }
);

mediaSchema.index({ tripId: 1, isDeleted: 1 });
mediaSchema.index({ tripId: 1, isDeleted: 1, category: 1 });
mediaSchema.index({ tripId: 1, isDeleted: 1, uploadedBy: 1 });

module.exports = mongoose.model(db.media, mediaSchema);
