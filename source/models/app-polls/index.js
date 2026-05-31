const mongoose = require("mongoose");
const db = require("../../utilities/constants/db-name");

const pollOptionSchema = new mongoose.Schema({
  label: { type: String, required: true },
  description: { type: String, default: "" },
  votes: [{ type: mongoose.Schema.Types.ObjectId, ref: db.users }],
});

const appPollSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    question: { type: String, required: true },
    pollType: { type: String, enum: ["general", "trip"], default: "general" },
    tripId: { type: mongoose.Schema.Types.ObjectId, ref: db.trips, default: null },
    options: [pollOptionSchema],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: db.users },
    pollStatus: {
      type: String,
      enum: ["open", "paused", "closed", "completed"],
      default: "open",
    },
    isDeleted: { type: Boolean, default: false },
  },
  { versionKey: false, timestamps: true, collection: db.appPolls }
);

appPollSchema.index({ pollType: 1 });
appPollSchema.index({ tripId: 1 });
appPollSchema.index({ pollStatus: 1 });

module.exports = mongoose.model(db.appPolls, appPollSchema);
