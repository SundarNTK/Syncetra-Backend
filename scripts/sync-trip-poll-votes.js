#!/usr/bin/env node
/**
 * One-time backfill: prune stale votes from existing trip polls.
 *
 * Poll vote lists used to be independent of group membership, so a vote cast
 * by a member who was later removed from every group linked to that trip
 * stayed on the poll forever (inflating "voted" counts and leaving their
 * name in the voter list). Going forward, group member removal cleans this
 * up automatically (see controllers/groups + controllers/polls), but
 * existing polls created before that fix still carry the stale votes. This
 * script re-syncs every trip poll against current group membership.
 *
 * Usage (from Syncetra-Backend/):
 *   node scripts/sync-trip-poll-votes.js        # apply changes
 *   node scripts/sync-trip-poll-votes.js --dry-run
 *
 * Requires MONGODB_URI in .env
 */

require("dotenv").config();
require("../source/configurations/mongoose");

const mongoose = require("mongoose");
const Env = require("../source/configurations/environment");
const Models = require("../source/models");
const db = require("../source/utilities/constants/db-name");

const DRY_RUN = process.argv.includes("--dry-run");

const getTripUniqueMemberIds = async (tripId) => {
  const groups = await Models[db.groups]
    .find({ tripId, isDeleted: { $ne: true } })
    .select("members")
    .lean();

  const memberSet = new Set();
  for (const g of groups) {
    for (const m of g.members || []) memberSet.add(String(m));
  }
  return memberSet;
};

async function main() {
  const uri = Env.MONGODB_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not configured.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log(`Connected to MongoDB${DRY_RUN ? " (dry run)" : ""}`);

  const Poll = Models[db.appPolls];
  const polls = await Poll.find({
    pollType: "trip",
    tripId: { $ne: null },
    isDeleted: { $ne: true },
  });

  console.log(`Found ${polls.length} trip poll(s) to check.`);

  let pollsChanged = 0;
  let votesRemoved = 0;

  for (const poll of polls) {
    const eligible = await getTripUniqueMemberIds(poll.tripId);
    let changed = false;
    const removedForThisPoll = [];

    for (const option of poll.options) {
      const before = option.votes.length;
      option.votes = option.votes.filter((v) => {
        const keep = eligible.has(String(v));
        if (!keep) removedForThisPoll.push(String(v));
        return keep;
      });
      if (option.votes.length !== before) changed = true;
    }

    if (changed) {
      pollsChanged += 1;
      votesRemoved += removedForThisPoll.length;
      console.log(
        `  [${poll._id}] "${poll.title}" — removing ${removedForThisPoll.length} stale vote(s): ${removedForThisPoll.join(", ")}`
      );
      if (!DRY_RUN) await poll.save();
    }
  }

  console.log(
    `Done. ${DRY_RUN ? "Would update" : "Updated"} ${pollsChanged} poll(s), removed ${votesRemoved} stale vote(s).`
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
