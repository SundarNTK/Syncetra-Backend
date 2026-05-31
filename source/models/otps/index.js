const mongoose = require("mongoose");
const db = require("../../utilities/constants/db-name");
const { TypeString, TypeDate } = require("../../utilities/types");

const otpSchema = new mongoose.Schema(
  {
    email: { ...TypeString, required: true },
    otp: { ...TypeString, required: true },
    expiresAt: { ...TypeDate, required: true },
  },
  { versionKey: false, timestamps: true, collection: db.otps }
);

otpSchema.index({ email: 1 });
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model(db.otps, otpSchema);
