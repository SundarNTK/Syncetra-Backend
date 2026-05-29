#!/usr/bin/env node
/**
 * Interactive script to create a Super Admin user and send a password-setup email.
 *
 * Usage (from alarm-service/ directory):
 *   node scripts/create-super-admin.js
 *
 * Prerequisites: .env must be configured with MONGODB_URI and (optionally) Gmail credentials.
 */

require("dotenv").config();

const readline = require("readline");
const mongoose = require("mongoose");
const jwt      = require("jsonwebtoken");
const Env      = require("../source/configurations/environment");
const { sendPasswordSetupEmail, isEmailConfigured } = require("../source/service/email");

// ─── Helpers ──────────────────────────────────────────────────────────────────

const rl     = readline.createInterface({ input: process.stdin, output: process.stdout });
const prompt = (q) => new Promise((resolve) => rl.question(q, resolve));

const signSetupToken = (userId) =>
  jwt.sign(
    { userId: String(userId), purpose: "password-setup" },
    Env.PASSWORD_SETUP_SECRET,
    { expiresIn: Env.PASSWORD_SETUP_EXPIRES }
  );

const buildSetupUrl = (token) => {
  const base = (Env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
  return `${base}/#/create-password?token=${token}`;
};

const mongoUri = () => {
  if (Env.MONGODB_URI) return Env.MONGODB_URI;
  const { DB_USERNAME, DB_PASSWORD, DB_HOST, DB_NAME, DB_OPTIONS } = Env;
  return `mongodb+srv://${DB_USERNAME}:${DB_PASSWORD}@${DB_HOST}/${DB_NAME}?${DB_OPTIONS}`;
};

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n═══ Create Super Admin ══════════════════════════════════════════\n");

  const name        = (await prompt("  Full Name   : ")).trim();
  const email       = (await prompt("  Email       : ")).trim().toLowerCase();
  const mobile      = (await prompt("  Mobile No.  : ")).trim().replace(/\D/g, "");
  const rawUsername = (await prompt("  Username    : ")).trim().toLowerCase();

  rl.close();

  if (!name || !email || !mobile) {
    console.error("\n❌  Name, email and mobile number are all required.\n");
    process.exit(1);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error("\n❌  Invalid email address.\n");
    process.exit(1);
  }
  if (!/^[0-9]{10,15}$/.test(mobile)) {
    console.error("\n❌  Mobile number must be 10–15 digits.\n");
    process.exit(1);
  }

  // ── Connect ────────────────────────────────────────────────────────────────
  console.log("\n  Connecting to MongoDB…");
  await mongoose.connect(mongoUri(), { dbName: Env.DB_NAME });
  console.log("  ✓ Connected\n");

  const User = require("../source/models/users");

  // ── Uniqueness checks ──────────────────────────────────────────────────────
  const emailTaken = await User.findOne({ email, isDeleted: false }).lean();
  if (emailTaken) {
    console.error(`  ❌  Email "${email}" already exists (role: ${emailTaken.role}).`);
    await mongoose.disconnect();
    process.exit(1);
  }

  if (rawUsername) {
    const usernameTaken = await User.findOne({ username: rawUsername, isDeleted: false }).lean();
    if (usernameTaken) {
      console.error(`  ❌  Username "${rawUsername}" is already taken.`);
      await mongoose.disconnect();
      process.exit(1);
    }
  }

  // ── Create super_admin ─────────────────────────────────────────────────────
  const userData = { name, email, mobileNumber: mobile, role: "super_admin" };
  if (rawUsername) userData.username = rawUsername;

  const user = new User(userData);
  await user.save();
  console.log(`  ✓ Super Admin created  (id: ${user._id})`);

  // ── Send setup email ───────────────────────────────────────────────────────
  const setupToken = signSetupToken(user._id);
  const setupUrl   = buildSetupUrl(setupToken);

  if (isEmailConfigured()) {
    try {
      await sendPasswordSetupEmail(email, { name, setupUrl });
      console.log(`  ✓ Password-setup email sent → ${email}`);
    } catch (err) {
      console.warn(`  ⚠  Email send failed: ${err.message || err}`);
      console.log(`\n  Setup URL (share manually):\n  ${setupUrl}\n`);
    }
  } else {
    console.log("\n  ℹ  Gmail not configured — setup URL (share manually):");
    console.log(`  ${setupUrl}\n`);
  }

  console.log("  ✓ Done. The super admin can now create their password via the link.\n");
  console.log("══════════════════════════════════════════════════════════════════\n");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("\n❌  Unexpected error:", err.message || err);
  rl.close();
  process.exit(1);
});
