const mongoose = require("mongoose");
const db = require("../../utilities/constants/db-name");
const messages = require("../../utilities/constants/messages");
const validateRequest = require("../../utilities/validations/validate-request");
const responseHandler = require("../../utilities/handlers/response-handler");
const exceptionHandler = require("../../utilities/handlers/exception-handler");
const queryHandler = require("../../utilities/handlers/query-handler");
const Models = require("../../models");
const {
  find,
  findOne,
  insertNewDocument,
  updateDocument,
} = require("../../utilities/helpers/mongo-query");
const {
  createGroupSchema,
  updateGroupSchema,
  addMemberSchema,
  updateMemberSchema,
} = require("./request-objects");
const { sendMemberInviteEmail, isEmailConfigured } = require("../../service/email");
const { removeUserVotesFromTripPolls, isTripMember } = require("../polls");

const normalizeEmail = (email) => email.trim().toLowerCase();

/**
 * After a group's membership/trip link changes, drop stale votes for any
 * user who is no longer eligible for that trip's polls (i.e. not a member
 * of any group linked to the trip anymore).
 */
const syncTripPollEligibility = async (tripId, userIds = []) => {
  if (!tripId || !userIds.length) return;
  for (const uid of userIds) {
    const stillEligible = await isTripMember(tripId, uid);
    if (!stillEligible) await removeUserVotesFromTripPolls(tripId, uid);
  }
};

const resolveMembers = async (members = [], groupName = "") => {
  const memberIds = [];
  const resolved = [];
  for (const m of members) {
    const email = normalizeEmail(m.email);
    let user = await findOne(db.users, {
      $or: [{ email }, { mobileNumber: m.mobileNumber }],
      isDeleted: false,
    });

    const isNew = !user;
    if (!user) {
      user = await insertNewDocument(db.users, {
        name: m.name || `User ${m.mobileNumber.slice(-4)}`,
        email,
        mobileNumber: m.mobileNumber,
        role: "user",
      });
    } else if (!user.email) {
      await updateDocument(db.users, { _id: user._id }, { email, name: m.name || user.name });
    }

    resolved.push({ id: user._id, email, name: m.name, mobileNumber: m.mobileNumber, isNew });
  }

  if (groupName && isEmailConfigured()) {
    for (const r of resolved) {
      try {
        await sendMemberInviteEmail(r.email, {
          name: r.name,
          groupName,
          mobileNumber: r.mobileNumber,
        });
      } catch (err) {
        console.warn(`Invite email failed for ${r.email}:`, err.message);
      }
    }
  }

  return resolved.map((r) => r.id);
};

const createGroup = async (req, res) => {
  try {
    const body = validateRequest({ schema: createGroupSchema, body: req.body });
    const group = await insertNewDocument(db.groups, {
      groupName: body.groupName,
      tripId: body.tripId || null,
      createdBy: req.user.userId,
      members: [],
    });

    const memberIds = await resolveMembers(body.members || [], body.groupName);
    await updateDocument(db.groups, { _id: group._id }, { members: memberIds });
    group.members = memberIds;

    return responseHandler({
      res,
      statusCode: 201,
      message: messages.CREATED,
      response: group,
    });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const findAllGroups = async (req, res) => {
  try {
    const { searchQuery, sortQuery } = queryHandler(req);
    const groups = await find(db.groups, searchQuery, sortQuery);
    return responseHandler({
      res,
      response: groups,
      recordsCount: groups.length,
    });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const findOneGroup = async (req, res) => {
  try {
    const group = await findOne(db.groups, {
      _id: req.params.id,
      isDeleted: false,
    });
    if (!group) throw messages.NOT_FOUND;

    const members = await find(db.users, {
      _id: { $in: group.members || [] },
      isDeleted: false,
    });

    const memberDetails = members.map((m) => ({
      ...m,
      hasFcmToken: !!(m.fcmToken && m.fcmToken.length > 0),
      alarmReady: !!(m.fcmToken && m.fcmToken.length > 0),
    }));

    return responseHandler({
      res,
      response: { ...group, memberDetails },
    });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const updateGroup = async (req, res) => {
  try {
    const body = validateRequest({ schema: updateGroupSchema, body: req.body });
    const update = {};

    const grp = await findOne(db.groups, { _id: req.params.id });
    const oldMembers = (grp?.members || []).map((m) => m.toString());
    const oldTripId = grp?.tripId || null;

    if (body.groupName) update.groupName = body.groupName;
    if (body.tripId !== undefined) update.tripId = body.tripId || null;
    if (body.members) {
      update.members = await resolveMembers(
        body.members,
        body.groupName || grp?.groupName
      );
    }

    const group = await updateDocument(
      db.groups,
      { _id: req.params.id, isDeleted: false },
      update
    );
    if (!group) throw messages.NOT_FOUND;

    // Clean up stale trip-poll votes for members who lost access to the trip via this group
    if (oldTripId) {
      const tripChanged =
        body.tripId !== undefined && String(oldTripId) !== String(update.tripId || "");
      const newMembers = (update.members || oldMembers.map((id) => id)).map(String);
      const removedMembers = oldMembers.filter((m) => !newMembers.includes(m));
      const affected = tripChanged ? oldMembers : removedMembers;
      await syncTripPollEligibility(oldTripId, affected);
    }

    return responseHandler({ res, message: messages.UPDATED, response: group });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const deleteGroup = async (req, res) => {
  try {
    const group = await updateDocument(
      db.groups,
      { _id: req.params.id },
      { isDeleted: true }
    );
    if (!group) throw messages.NOT_FOUND;
    return responseHandler({ res, message: messages.DELETED });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const addMember = async (req, res) => {
  try {
    const body = validateRequest({ schema: addMemberSchema, body: req.body });
    const group = await findOne(db.groups, {
      _id: req.params.id,
      isDeleted: false,
    });
    if (!group) throw messages.NOT_FOUND;

    let newMemberId;
    if (body.userId) {
      // Add an existing registered user directly by their _id
      const user = await findOne(db.users, { _id: body.userId, isDeleted: false });
      if (!user) throw "User not found.";
      newMemberId = user._id;
    } else {
      // Legacy: create/find user by name + email + mobile
      const [resolved] = await resolveMembers(
        [{ name: body.name, email: body.email, mobileNumber: body.mobileNumber }],
        group.groupName
      );
      newMemberId = resolved;
    }

    const updated = await Models[db.groups].findOneAndUpdate(
      { _id: group._id, isDeleted: false },
      { $addToSet: { members: new mongoose.Types.ObjectId(String(newMemberId)) } },
      { new: true }
    );

    return responseHandler({ res, message: messages.UPDATED, response: updated });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const addMembersBulk = async (req, res) => {
  try {
    const { userIds } = req.body;
    if (!Array.isArray(userIds) || userIds.length === 0)
      throw "userIds must be a non-empty array";

    const group = await findOne(db.groups, { _id: req.params.id, isDeleted: false });
    if (!group) throw messages.NOT_FOUND;

    const users = await Models[db.users]
      .find({ _id: { $in: userIds }, isDeleted: false })
      .select("_id")
      .lean();
    if (users.length === 0) throw "No valid users found for the provided IDs";

    const memberOids = users.map((u) => new mongoose.Types.ObjectId(String(u._id)));

    const updated = await Models[db.groups].findOneAndUpdate(
      { _id: group._id, isDeleted: false },
      { $addToSet: { members: { $each: memberOids } } },
      { new: true }
    );

    return responseHandler({
      res,
      message: `${users.length} member${users.length !== 1 ? "s" : ""} added successfully`,
      response: updated,
    });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const updateMember = async (req, res) => {
  try {
    const { id: groupId, memberId } = req.params;
    const body = validateRequest({ schema: updateMemberSchema, body: req.body });

    const group = await findOne(db.groups, {
      _id: groupId,
      isDeleted: false,
    });
    if (!group) throw messages.NOT_FOUND;

    const memberInGroup = (group.members || []).some(
      (m) => m.toString() === memberId
    );
    if (!memberInGroup) throw "Member not found in this group";

    const updated = await updateDocument(
      db.users,
      { _id: memberId, isDeleted: false },
      { name: body.name, mobileNumber: body.mobileNumber }
    );
    if (!updated) throw messages.NOT_FOUND;

    return responseHandler({
      res,
      message: messages.UPDATED,
      response: {
        ...updated,
        hasFcmToken: !!(updated.fcmToken && updated.fcmToken.length > 0),
      },
    });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const removeMember = async (req, res) => {
  try {
    const { id: groupId, memberId } = req.params;

    const group = await findOne(db.groups, {
      _id: groupId,
      isDeleted: false,
    });
    if (!group) throw messages.NOT_FOUND;

    const members = (group.members || [])
      .map((m) => m.toString())
      .filter((m) => m !== memberId);

    await updateDocument(
      db.groups,
      { _id: groupId },
      { members: members.map((id) => new mongoose.Types.ObjectId(id)) }
    );

    // Drop this member's votes from the trip's polls if they're no longer
    // part of any group linked to the trip
    if (group.tripId) {
      await syncTripPollEligibility(group.tripId, [memberId]);
    }

    return responseHandler({ res, message: "Member removed from group" });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const findUserGroups = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const groups = await find(db.groups, {
      members: userId,
      isDeleted: false,
    });

    // Batch-fetch all member user documents across all groups in one query
    const allIds = [...new Set(groups.flatMap((g) => (g.members || []).map(String)))];
    const users = allIds.length
      ? await find(db.users, { _id: { $in: allIds }, isDeleted: false })
      : [];
    const userMap = Object.fromEntries(users.map((u) => [String(u._id), u]));

    const enriched = groups.map((g) => ({
      ...g,
      memberDetails: (g.members || []).map((id) => {
        const u = userMap[String(id)];
        return u ? { _id: u._id, name: u.name, email: u.email } : { _id: id, name: "Unknown" };
      }),
    }));

    return responseHandler({
      res,
      response: enriched,
      recordsCount: enriched.length,
    });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

module.exports = {
  createGroup,
  findAllGroups,
  findOneGroup,
  updateGroup,
  deleteGroup,
  addMember,
  addMembersBulk,
  updateMember,
  removeMember,
  findUserGroups,
};
