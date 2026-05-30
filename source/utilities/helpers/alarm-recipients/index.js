const mongoose = require("mongoose");
const db = require("../../constants/db-name");
const { find, findOne } = require("../mongo-query");

const TARGET_TYPES = {
  GROUP_ALL: "group_all",
  TRIP_ALL: "trip_all",
  SELECTED: "selected",
};

const collectTripMemberIdStrings = async (tripId) => {
  if (!tripId) return [];
  const trip = await findOne(db.trips, { _id: tripId, isDeleted: false });
  if (!trip) return [];

  const memberIdSet = new Set((trip.members || []).map((m) => String(m)));
  const groups = await find(db.groups, {
    tripId: new mongoose.Types.ObjectId(String(tripId)),
    isDeleted: false,
  });
  for (const g of groups) {
    for (const m of g.members || []) memberIdSet.add(String(m));
  }
  return [...memberIdSet];
};

/**
 * Resolve which user ids should receive an alarm (socket, FCM, logs).
 */
const resolveAlarmRecipientIds = async (alarm, group) => {
  if (!group) return [];

  const targetType = alarm?.targetType || TARGET_TYPES.GROUP_ALL;

  if (targetType === TARGET_TYPES.SELECTED) {
    const selected = (alarm.targetMemberIds || []).map((id) => String(id)).filter(Boolean);
    if (selected.length) return selected;
    return (group.members || []).map((id) => String(id));
  }

  if (targetType === TARGET_TYPES.TRIP_ALL && group.tripId) {
    return collectTripMemberIdStrings(group.tripId);
  }

  return (group.members || []).map((id) => String(id));
};

const userInAlarmRecipients = async (alarm, group, userId) => {
  const ids = await resolveAlarmRecipientIds(alarm, group);
  return ids.includes(String(userId));
};

const validateAlarmTargets = async (body, group) => {
  const targetType = body.targetType || TARGET_TYPES.GROUP_ALL;
  let targetMemberIds = [];

  if (targetType === TARGET_TYPES.TRIP_ALL && !group.tripId) {
    throw "This group is not linked to a trip. Choose all group members or particular members.";
  }

  if (targetType === TARGET_TYPES.SELECTED) {
    const pool = group.tripId
      ? await collectTripMemberIdStrings(group.tripId)
      : (group.members || []).map((id) => String(id));
    const selected = (body.targetMemberIds || []).map(String).filter(Boolean);
    if (!selected.length) throw "Select at least one member";
    for (const id of selected) {
      if (!pool.includes(id)) throw "Each selected member must belong to this group or trip";
    }
    targetMemberIds = selected.map((id) => new mongoose.Types.ObjectId(id));
  }

  return { targetType, targetMemberIds };
};

module.exports = {
  TARGET_TYPES,
  collectTripMemberIdStrings,
  resolveAlarmRecipientIds,
  userInAlarmRecipients,
  validateAlarmTargets,
};
