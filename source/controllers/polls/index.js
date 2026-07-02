const mongoose = require("mongoose");
const db = require("../../utilities/constants/db-name");
const Models = require("../../models");
const Env = require("../../configurations/environment");
const responseHandler = require("../../utilities/handlers/response-handler");
const exceptionHandler = require("../../utilities/handlers/exception-handler");
const { find, findOne, insertNewDocument, updateDocument } = require("../../utilities/helpers/mongo-query");

const Poll = () => Models[db.appPolls];

const VALID_STATUSES = ["open", "paused", "closed", "completed"];

// ─── Derive leading option label from poll options ────────────────────────────
const getLeadingOption = (options = []) => {
  if (!options.length) return null;
  const totalVotes = options.reduce((s, o) => s + (o.votes?.length || 0), 0);
  if (totalVotes === 0) return null;
  const maxVotes = Math.max(...options.map((o) => o.votes?.length || 0));
  const winner = options.find((o) => (o.votes?.length || 0) === maxVotes);
  return winner ? winner.label : null;
};

// ─── Unique voters (one vote per user across options) ─────────────────────────
const countUniqueVoters = (options = []) => {
  const ids = new Set();
  for (const o of options) {
    for (const v of o.votes || []) {
      ids.add(String(v));
    }
  }
  return ids.size;
};

// ─── Eligible voters: all members (role user) for general; trip.members for trip polls
const getGeneralMemberCount = () =>
  Models[db.users].countDocuments({ isDeleted: { $ne: true }, role: Env.ROLES.USER });

/**
 * Collect unique member IDs for a trip from all groups linked to it.
 * Groups are the source of truth for trip membership in this system.
 */
const getTripUniqueMemberIds = async (tripId) => {
  if (!tripId) return new Set();
  const tripOid = new mongoose.Types.ObjectId(String(tripId));

  const groups = await Models[db.groups]
    .find({ tripId: tripOid, isDeleted: { $ne: true } })
    .select("members")
    .lean();

  const memberSet = new Set();
  for (const g of groups) {
    for (const m of (g.members || [])) memberSet.add(String(m));
  }
  return memberSet;
};

const getEligibleMemberCountForTripId = async (tripId) => {
  const members = await getTripUniqueMemberIds(tripId);
  return members.size;
};

/**
 * Remove a user's vote(s) from every trip poll tied to a given trip.
 * Used when a member is removed from all groups linked to that trip so
 * poll vote lists / counts stay consistent with current group membership.
 */
const removeUserVotesFromTripPolls = async (tripId, userId) => {
  if (!tripId || !userId) return;
  const tripOid = new mongoose.Types.ObjectId(String(tripId));
  const userOid = new mongoose.Types.ObjectId(String(userId));

  const polls = await Poll().find({
    pollType: "trip",
    tripId: tripOid,
    isDeleted: false,
    "options.votes": userOid,
  });

  for (const poll of polls) {
    let changed = false;
    for (const option of poll.options) {
      const before = option.votes.length;
      option.votes = option.votes.filter((v) => String(v) !== String(userOid));
      if (option.votes.length !== before) changed = true;
    }
    if (changed) await poll.save();
  }
};

/** Returns true if userId is in any group linked to the trip */
const isTripMember = async (tripId, userId) => {
  if (!tripId || !userId) return false;
  const tripOid = new mongoose.Types.ObjectId(String(tripId));
  const userOid = new mongoose.Types.ObjectId(String(userId));

  const group = await Models[db.groups]
    .findOne({ tripId: tripOid, members: userOid, isDeleted: { $ne: true } })
    .select("_id")
    .lean();
  return !!group;
};

/**
 * Batch-fetch member counts for many tripIds.
 * Counts unique members across all groups linked to each trip.
 */
const getTripMemberCountMap = async (tripIds) => {
  if (!tripIds?.length) return {};
  const oids = tripIds.map((id) => new mongoose.Types.ObjectId(id));

  const groups = await Models[db.groups]
    .find({ tripId: { $in: oids }, isDeleted: { $ne: true } })
    .select("tripId members")
    .lean();

  const map = {};
  for (const g of groups) {
    const key = String(g.tripId);
    if (!map[key]) map[key] = new Set();
    for (const m of (g.members || [])) map[key].add(String(m));
  }

  const result = {};
  for (const id of tripIds) {
    const key = String(id);
    result[key] = map[key] ? map[key].size : 0;
  }
  return result;
};

const enrichPollListItem = (poll, generalMemberCount, tripMemberMap) => {
  const eligible =
    poll.pollType === "trip" && poll.tripId
      ? tripMemberMap[String(poll.tripId)] ?? 0
      : generalMemberCount;
  const uniqueVoterCount = countUniqueVoters(poll.options || []);
  return {
    ...poll,
    eligibleMemberCount: eligible,
    uniqueVoterCount,
  };
};

// ─── When every eligible member has voted → auto mark completed ─────────────
const checkAutoComplete = async (poll) => {
  const votedCount = countUniqueVoters(poll.options);
  if (votedCount === 0) return;

  let eligibleCount = 0;
  if (poll.pollType === "trip" && poll.tripId) {
    eligibleCount = await getEligibleMemberCountForTripId(poll.tripId);
  } else {
    eligibleCount = await getGeneralMemberCount();
  }

  if (eligibleCount > 0 && votedCount >= eligibleCount) {
    poll.pollStatus = "completed";
  }
};

// ─── List polls ───────────────────────────────────────────────────────────────
const getPolls = async (req, res) => {
  try {
    const { type, tripId } = req.query;
    const isUser = req.user?.role === Env.ROLES.USER;
    const query = { isDeleted: false };
    if (type && type !== "all") query.pollType = type;
    if (tripId) query.tripId = new mongoose.Types.ObjectId(tripId);

    // Members only see general polls + trip polls for trips they belong to (via groups)
    if (isUser && !tripId) {
      const userId = new mongoose.Types.ObjectId(req.user.userId);

      // Groups are the source of truth for trip membership
      const userGroups = await Models[db.groups]
        .find({ members: userId, isDeleted: { $ne: true }, tripId: { $ne: null } })
        .select("tripId")
        .lean();

      const userTripIds = [
        ...new Set(userGroups.filter((g) => g.tripId).map((g) => String(g.tripId))),
      ].map((id) => new mongoose.Types.ObjectId(id));

      if (!type || type === "all") {
        // Replace any pollType filter with an $or covering both types
        delete query.pollType;
        query.$or = [
          { pollType: "general" },
          { pollType: "trip", tripId: { $in: userTripIds } },
        ];
      } else if (type === "trip") {
        // Already filtered to trip; further restrict to user's trips
        query.tripId = { $in: userTripIds };
      }
      // type === "general": no extra filter needed
    }

    const polls = await Poll().find(query).sort({ createdAt: -1 }).lean();
    const generalMemberCount = await getGeneralMemberCount();
    const tripIdSet = new Set();
    for (const p of polls) {
      if (p.pollType === "trip" && p.tripId) tripIdSet.add(String(p.tripId));
    }
    const tripMemberMap = await getTripMemberCountMap([...tripIdSet]);
    const enriched = polls.map((p) => enrichPollListItem(p, generalMemberCount, tripMemberMap));
    return responseHandler({ res, response: enriched, recordsCount: enriched.length });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

// ─── Get single poll ──────────────────────────────────────────────────────────
const getPoll = async (req, res) => {
  try {
    const poll = await findOne(db.appPolls, { _id: req.params.id, isDeleted: false });
    if (!poll) throw "Poll not found";
    const generalMemberCount = await getGeneralMemberCount();
    const tripMemberMap = poll.tripId
      ? await getTripMemberCountMap([String(poll.tripId)])
      : {};
    const enriched = enrichPollListItem(poll, generalMemberCount, tripMemberMap);
    return responseHandler({ res, response: enriched });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

// ─── Create poll (super admin only) ──────────────────────────────────────────
const createPoll = async (req, res) => {
  try {
    const { title, question, pollType, tripId, options } = req.body;
    if (!title || !question) throw "title and question are required";
    if (!options || options.length < 2) throw "At least 2 options are required";

    const formattedOptions = options.map((o) => ({
      label: String(o.label || "").trim(),
      description: String(o.description || "").trim(),
      votes: [],
    }));

    const poll = await insertNewDocument(db.appPolls, {
      title: title.trim(),
      question: question.trim(),
      pollType: pollType === "trip" ? "trip" : "general",
      tripId: pollType === "trip" && tripId ? new mongoose.Types.ObjectId(tripId) : null,
      options: formattedOptions,
      createdBy: req.user.userId,
      pollStatus: "open",
    });

    return responseHandler({ res, statusCode: 201, message: "Poll created", response: poll });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

// ─── Update poll (super admin: full; admin: pollStatus only) ─────────────────
const updatePoll = async (req, res) => {
  try {
    const { title, question, pollStatus, options, pollType, tripId } = req.body;
    const existing = await Poll().findOne({ _id: req.params.id, isDeleted: false });
    if (!existing) throw "Poll not found";

    const isSuperAdmin = req.user?.role === Env.ROLES.SUPER_ADMIN;
    if (!isSuperAdmin) {
      if (title !== undefined || question !== undefined || options !== undefined) {
        throw "Only Super Admins can edit poll content. Administrators may change poll status only.";
      }
    }

    const totalVotes = (existing.options || []).reduce(
      (s, o) => s + (o.votes?.length || 0),
      0
    );

    const update = {};
    if (isSuperAdmin && title !== undefined) update.title = String(title).trim();
    if (isSuperAdmin && question !== undefined) update.question = String(question).trim();
    if (pollStatus !== undefined) {
      if (!VALID_STATUSES.includes(pollStatus)) throw `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`;
      update.pollStatus = pollStatus;
    }

    if (isSuperAdmin && pollType !== undefined) {
      update.pollType = pollType === "trip" ? "trip" : "general";
      update.tripId =
        pollType === "trip" && tripId
          ? new mongoose.Types.ObjectId(tripId)
          : null;
    }

    if (isSuperAdmin && options !== undefined) {
      if (totalVotes > 0) throw "Cannot change options after votes have been cast";
      if (!Array.isArray(options) || options.length < 2) throw "At least 2 options are required";
      update.options = options.map((o) => ({
        label: String(o.label || "").trim(),
        description: String(o.description || ""),
        votes: [],
      }));
    }

    if (Object.keys(update).length === 0) throw "No valid fields to update";

    const poll = await updateDocument(
      db.appPolls,
      { _id: req.params.id, isDeleted: false },
      { ...update }
    );
    if (!poll) throw "Poll not found";
    return responseHandler({ res, message: "Poll updated", response: poll });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

// ─── Delete poll ──────────────────────────────────────────────────────────────
const deletePoll = async (req, res) => {
  try {
    const poll = await updateDocument(db.appPolls, { _id: req.params.id, isDeleted: false }, { isDeleted: true });
    if (!poll) throw "Poll not found";
    return responseHandler({ res, message: "Poll deleted" });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

// ─── Vote ─────────────────────────────────────────────────────────────────────
const votePoll = async (req, res) => {
  try {
    const { optionIndex } = req.body;
    if (optionIndex === undefined || optionIndex === null) throw "optionIndex is required";

    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const poll = await Poll().findOne({ _id: req.params.id, isDeleted: false, pollStatus: "open" });
    if (!poll) throw "Poll not found or is not accepting votes";

    const idx = Number(optionIndex);
    if (idx < 0 || idx >= poll.options.length) throw "Invalid option";

    // Trip polls: only members of the assigned trip may vote
    if (poll.pollType === "trip" && poll.tripId) {
      const eligible = await isTripMember(poll.tripId, userId);
      if (!eligible) throw "You are not eligible to vote on this poll";
    }

    const alreadyVoted = poll.options.some((o) =>
      o.votes.some((v) => v.toString() === userId.toString())
    );
    if (alreadyVoted) throw "You have already voted on this poll";

    poll.options[idx].votes.push(userId);

    await checkAutoComplete(poll);
    await poll.save();

    return responseHandler({ res, message: "Vote recorded", response: poll });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

// ─── Analytics ───────────────────────────────────────────────────────────────
const getPollAnalytics = async (req, res) => {
  try {
    const poll = await Poll()
      .findOne({ _id: req.params.id, isDeleted: false })
      .populate("options.votes", "name email mobileNumber")
      .lean();
    if (!poll) throw "Poll not found";

    const totalVotes = poll.options.reduce((sum, o) => sum + (o.votes?.length || 0), 0);
    const maxVotes   = Math.max(...poll.options.map((o) => o.votes?.length || 0), 0);
    const uniqueVoterCount = countUniqueVoters(poll.options);

    let eligibleMemberCount = 0;
    if (poll.pollType === "trip" && poll.tripId) {
      eligibleMemberCount = await getEligibleMemberCountForTripId(poll.tripId);
    } else {
      eligibleMemberCount = await getGeneralMemberCount();
    }

    const analytics = poll.options.map((o, i) => {
      const voteCount = o.votes?.length || 0;
      const voteSharePercent = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
      const eligiblePercent =
        eligibleMemberCount > 0 ? Math.round((voteCount / eligibleMemberCount) * 100) : 0;
      return {
        index: i,
        label: o.label,
        voteCount,
        percentage: eligiblePercent,
        voteSharePercent,
        eligiblePercent,
        isLeading: voteCount === maxVotes && maxVotes > 0,
        voters: (o.votes || []).map((v) => ({ name: v.name, email: v.email, mobile: v.mobileNumber })),
      };
    });

    const leadingLabel = getLeadingOption(poll.options);

    return responseHandler({
      res,
      response: {
        poll,
        totalVotes,
        uniqueVoterCount,
        eligibleMemberCount,
        analytics,
        leadingLabel,
      },
    });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

module.exports = {
  getPolls,
  getPoll,
  createPoll,
  updatePoll,
  deletePoll,
  votePoll,
  getPollAnalytics,
  isTripMember,
  removeUserVotesFromTripPolls,
};
