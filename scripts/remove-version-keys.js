#!/usr/bin/env node
/**
 * One-time migration: remove __v from all MongoDB documents.
 *
 * Usage (from Syncetra-Backend/):
 *   node scripts/remove-version-keys.js
 *
 * Requires MONGODB_URI in .env
 */

require("dotenv").config();
require("../source/configurations/mongoose");

const mongoose = require("mongoose");
const Env = require("../source/configurations/environment");

async function main() {
  const uri = Env.MONGODB_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not configured.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Connected to MongoDB");

  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();

  let totalModified = 0;
  for (const { name } of collections) {
    const result = await db.collection(name).updateMany(
      { __v: { $exists: true } },
      { $unset: { __v: "" } }
    );
    if (result.modifiedCount > 0) {
      console.log(`  ${name}: removed __v from ${result.modifiedCount} document(s)`);
      totalModified += result.modifiedCount;
    }
  }

  console.log(`Done. Updated ${totalModified} document(s) across ${collections.length} collection(s).`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
