const mongoose = require("mongoose");
const db = require("../../utilities/constants/db-name");
const { TypeString, TypeBoolean } = require("../../utilities/types");

const userSchema = new mongoose.Schema(
  {
    username: { type: String },                          // optional; set via register/createMember
    name: { ...TypeString, required: true },
    email: { ...TypeString, required: true, unique: true },
    mobileNumber: { ...TypeString, required: true },
    password: TypeString,                               // null until set via email link
    role: { ...TypeString, enum: ["super_admin", "admin", "user"], default: "user" },
    fcmToken: TypeString,
    profileImage: TypeString,              // base64 data-URL, stored on update
    isDeleted: { ...TypeBoolean, default: false },
  },
  { versionKey: false, timestamps: true, collection: db.users }
);

userSchema.index({ mobileNumber: 1 });
userSchema.index({ role: 1 });
userSchema.index({ username: 1 }, { unique: true, sparse: true }); // sparse: null/undefined allowed

module.exports = mongoose.model(db.users, userSchema);
