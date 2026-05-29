const mongoose = require("mongoose");
const db = require("../../utilities/constants/db-name");
const messages = require("../../utilities/constants/messages");
const validateRequest = require("../../utilities/validations/validate-request");
const responseHandler = require("../../utilities/handlers/response-handler");
const exceptionHandler = require("../../utilities/handlers/exception-handler");
const queryHandler = require("../../utilities/handlers/query-handler");
const {
  find,
  findOne,
  insertNewDocument,
  updateDocument,
} = require("../../utilities/helpers/mongo-query");
const { generateStopCode, generateUniqueId } = require("../../utilities/helpers/generic");
const { normalizeSchedules } = require("../../utilities/helpers/alarm-schedule");
const {
  triggerAlarm,
  triggerAlarmSlot,
  completeSlotIfDone,
  ALARM_STATUS,
} = require("../../utilities/helpers/alarm-trigger");
const { emitToGroup } = require("../../configurations/socket");
const { scheduleAlarmSchema, stopAlarmSchema } = require("./request-objects");

const sanitizeAlarmForUser = (alarm) => {
  const { stopCode, ...rest } = alarm;
  return rest;
};

const sanitizeAlarmList = (alarms, role) => {
  if (role === "admin") return alarms;
  return alarms.map(sanitizeAlarmForUser);
};

const scheduleAlarm = async (req, res) => {
  try {
    const body = validateRequest({ schema: scheduleAlarmSchema, body: req.body });

    const group = await findOne(db.groups, {
      _id: body.groupId,
      isDeleted: false,
    });
    if (!group) throw "Group not found";

    const stopCode = generateStopCode();
    const schedules = normalizeSchedules(body.schedules);

    const alarm = await insertNewDocument(db.alarms, {
      groupId: body.groupId,
      title: body.title,
      description: body.description || "",
      schedules,
      stopCode,
      repeatType: body.repeatType,
      soundType: body.soundType || "siren",
      status: ALARM_STATUS.SCHEDULED,
      createdBy: req.user.userId,
    });

    return responseHandler({
      res,
      statusCode: 201,
      message: messages.CREATED,
      response: alarm,
    });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const triggerEmergency = async (req, res) => {
  try {
    const { groupId, title, description } = req.body;
    if (!groupId || !title) throw "groupId and title are required";

    const group = await findOne(db.groups, {
      _id: groupId,
      isDeleted: false,
    });
    if (!group) throw "Group not found";

    const stopCode = generateStopCode();
    const alarm = await insertNewDocument(db.alarms, {
      groupId,
      title,
      description: description || "Emergency alarm",
      alarmTime: new Date(),
      stopCode,
      repeatType: "none",
      soundType: req.body.soundType || "siren",
      status: ALARM_STATUS.SCHEDULED,
      isEmergency: true,
      createdBy: req.user.userId,
    });

    await triggerAlarmSlot(alarm._id, "emergency");

    return responseHandler({
      res,
      message: "Emergency alarm triggered",
      response: alarm,
    });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const findAllAlarms = async (req, res) => {
  try {
    const { searchQuery, sortQuery } = queryHandler(req);
    searchQuery.isDeleted = false;

    const alarms = await find(db.alarms, searchQuery, sortQuery);
    return responseHandler({
      res,
      response: alarms,
      recordsCount: alarms.length,
    });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const findActiveAlarms = async (req, res) => {
  try {
    const alarms = await find(db.alarms, {
      status: ALARM_STATUS.ACTIVE,
      isDeleted: false,
    });
    return responseHandler({ res, response: alarms, recordsCount: alarms.length });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const getStopCode = async (req, res) => {
  try {
    const alarm = await findOne(db.alarms, {
      _id: req.params.id,
      isDeleted: false,
    });
    if (!alarm) throw messages.NOT_FOUND;

    if (alarm.status !== ALARM_STATUS.ACTIVE) {
      throw "Stop code is only visible when alarm is active";
    }

    return responseHandler({
      res,
      response: { stopCode: alarm.stopCode },
      message: "Stop code retrieved",
    });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const cancelAlarm = async (req, res) => {
  try {
    const alarm = await updateDocument(
      db.alarms,
      {
        _id: req.params.id,
        status: { $in: [ALARM_STATUS.SCHEDULED, ALARM_STATUS.ACTIVE] },
      },
      { status: ALARM_STATUS.CANCELLED }
    );
    if (!alarm) throw messages.NOT_FOUND;

    emitToGroup(alarm.groupId.toString(), "alarm:cancelled", {
      alarmId: alarm._id.toString(),
    });

    return responseHandler({ res, message: "Alarm cancelled", response: alarm });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const getUserActiveAlarm = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const groups = await find(db.groups, { members: userId, isDeleted: false });
    const groupIds = groups.map((g) => g._id);

    const alarm = await findOne(db.alarms, {
      groupId: { $in: groupIds },
      status: ALARM_STATUS.ACTIVE,
      isDeleted: false,
    });

    return responseHandler({
      res,
      response: alarm ? sanitizeAlarmForUser(alarm) : null,
    });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const stopAlarm = async (req, res) => {
  try {
    const { code } = validateRequest({ schema: stopAlarmSchema, body: req.body });

    const alarm = await findOne(db.alarms, {
      _id: req.params.id,
      status: ALARM_STATUS.ACTIVE,
      isDeleted: false,
    });
    if (!alarm) throw messages.NOT_FOUND;

    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const groups = await find(db.groups, {
      members: userId,
      _id: alarm.groupId,
      isDeleted: false,
    });
    if (!groups.length) throw messages.FORBIDDEN;

    const logQuery = {
      alarmId: alarm._id,
      userId,
      ...(alarm.activeSlotId ? { slotId: alarm.activeSlotId } : {}),
    };

    let log = await findOne(db.alarmLogs, logQuery);
    if (!log) {
      log = await insertNewDocument(db.alarmLogs, {
        ...logQuery,
        status: "pending",
        enteredCode: null,
        stoppedAt: null,
      });
    }

    if (alarm.stopCode !== code) {
      await updateDocument(db.alarmLogs, logQuery, {
        enteredCode: code,
        status: "failed",
      });
      throw messages.INVALID_CODE;
    }

    await updateDocument(db.alarmLogs, logQuery, {
      enteredCode: code,
      status: "stopped",
      stoppedAt: new Date(),
    });

    const pendingLogs = await find(db.alarmLogs, {
      alarmId: alarm._id,
      slotId: alarm.activeSlotId || null,
      status: "pending",
    });

    if (!pendingLogs.length) {
      await completeSlotIfDone(alarm._id);
      emitToGroup(alarm.groupId.toString(), "alarm:completed", {
        alarmId: alarm._id.toString(),
      });
    }

    emitToGroup(alarm.groupId.toString(), "alarm:stopped", {
      alarmId: alarm._id.toString(),
      userId,
    });

    return responseHandler({ res, message: messages.ALARM_STOPPED });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const getUserAlarmHistory = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const groups = await find(db.groups, { members: userId, isDeleted: false });
    const groupIds = groups.map((g) => g._id);

    const alarms = await find(
      db.alarms,
      {
        groupId: { $in: groupIds },
        status: { $in: [ALARM_STATUS.COMPLETED, ALARM_STATUS.CANCELLED, ALARM_STATUS.ACTIVE] },
        isDeleted: false,
      },
      { createdAt: -1 }
    );

    return responseHandler({
      res,
      response: sanitizeAlarmList(alarms, req.user.role),
      recordsCount: alarms.length,
    });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const getAlarmLogs = async (req, res) => {
  try {
    const alarm = await findOne(db.alarms, {
      _id: req.params.id,
      isDeleted: false,
    });
    if (!alarm) throw messages.NOT_FOUND;

    const logs = await find(db.alarmLogs, { alarmId: alarm._id });
    const userIds = [...new Set(logs.map((l) => l.userId.toString()))];
    const users = await find(db.users, { _id: { $in: userIds } });
    const userMap = Object.fromEntries(
      users.map((u) => [u._id.toString(), u])
    );

    const enriched = logs.map((log) => ({
      ...log,
      user: userMap[log.userId.toString()] || null,
    }));

    return responseHandler({ res, response: enriched, recordsCount: enriched.length });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

/** Returns mobile numbers of all members in an alarm's group (admin only). */
const getAlarmMemberPhones = async (req, res) => {
  try {
    const alarm = await findOne(db.alarms, { _id: req.params.id, isDeleted: false });
    if (!alarm) throw messages.NOT_FOUND;

    const group = await findOne(db.groups, { _id: alarm.groupId, isDeleted: false });
    if (!group) throw "Group not found";

    const members = await find(db.users, {
      _id: { $in: group.members || [] },
      mobileNumber: { $exists: true, $ne: null, $ne: "" },
      isDeleted: false,
    });

    return responseHandler({
      res,
      response: { phones: members.map((u) => u.mobileNumber) },
    });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const { testTriggerByMobile } = require("./test-trigger-handler");

const triggerAlarmNow = async (req, res) => {
  try {
    const alarm = await findOne(db.alarms, {
      _id: req.params.id,
      isDeleted: false,
    });
    if (!alarm) throw messages.NOT_FOUND;

    const slotId =
      alarm.schedules?.[0]?.times?.[0]?.slotId || `manual-${generateUniqueId()}`;
    const triggered = await triggerAlarmSlot(alarm._id, slotId);

    if (!triggered) {
      throw "Could not trigger. Alarm may already be active or completed.";
    }

    return responseHandler({
      res,
      message: "Alarm triggered now",
      response: { alarmId: alarm._id, stopCode: alarm.stopCode },
    });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

module.exports = {
  scheduleAlarm,
  triggerEmergency,
  testTriggerByMobile,
  triggerAlarmNow,
  findAllAlarms,
  findActiveAlarms,
  getStopCode,
  cancelAlarm,
  getUserActiveAlarm,
  stopAlarm,
  getUserAlarmHistory,
  getAlarmLogs,
  getAlarmMemberPhones,
};
