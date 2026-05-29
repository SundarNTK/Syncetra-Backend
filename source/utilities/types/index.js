const mongoose = require("mongoose");

module.exports = {
  TypeString: { type: String },
  TypeNumber: { type: Number },
  TypeBoolean: { type: Boolean, default: false },
  TypeDate: { type: Date },
  TypeObjectId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  TypeObjectIdArray: [{ type: mongoose.Schema.Types.ObjectId }],
};
