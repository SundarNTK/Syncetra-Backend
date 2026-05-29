const db = require("../../constants/db-name");
const Models = require("../../../models");
const { find, findOne, insertNewDocument } = require("../mongo-query");
const { emitToGroup } = require("../../../configurations/socket");
const { sendPushToUsers, sendSmsCommandToSuperAdmin } = require("../fcm");
const { allSlotsTriggered } = require("../alarm-schedule");

const ALARM_STATUS = {
  SCHEDULED: "scheduled",
  ACTIVE: "active",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

const triggerAlarmSlot = async (alarmId, slotId) => {
  const alarm = await Models[db.alarms].findOne({
    _id: alarmId,
    isDeleted: false,
    status: { $in: [ALARM_STATUS.SCHEDULED, ALARM_STATUS.ACTIVE] },
  });

  if (!alarm) return null;

  const group = await findOne(db.groups, {
    _id: alarm.groupId,
    isDeleted: false,
  });
  if (!group) return null;

  let slotFound = false;
  for (const schedule of alarm.schedules || []) {
    for (const slot of schedule.times || []) {
      if (slot.slotId === slotId && !slot.triggered) {
        slot.triggered = true;
        slot.triggeredAt = new Date();
        slotFound = true;
        break;
      }
    }
    if (slotFound) break;
  }

  if (!slotFound && !alarm.isEmergency) return null;

  alarm.status = ALARM_STATUS.ACTIVE;
  alarm.activeSlotId = slotId;
  alarm.triggeredAt = new Date();
  await alarm.save();

  const memberIds = group.members || [];
  const payload = {
    alarmId: alarm._id.toString(),
    groupId: alarm.groupId.toString(),
    slotId,
    title: alarm.title,
    description: alarm.description || "",
    soundType: alarm.soundType || "beep",
    status: ALARM_STATUS.ACTIVE,
  };

  emitToGroup(alarm.groupId.toString(), "alarm:triggered", payload);

  await sendPushToUsers(memberIds, {
    title: `ALARM: ${alarm.title}`,
    body: alarm.description || "Group alarm is active. Open the app now.",
    data: {
      type: "alarm",
      alarmId: alarm._id.toString(),
      groupId: alarm.groupId.toString(),
      slotId: slotId || "",
      soundType: alarm.soundType || "siren",
    },
  });

  // For emergency alarms, also dispatch an SMS_COMMAND to all super_admin devices.
  // Their app will use the device SIM to SMS all group members — this covers
  // users who are offline or have no internet at the time of the alert.
  if (alarm.isEmergency) {
    const members = await find(db.users, {
      _id: { $in: memberIds },
      mobileNumber: { $exists: true, $ne: null, $ne: "" },
      isDeleted: false,
    });
    const memberPhones = members.map((u) => u.mobileNumber).filter(Boolean);

    if (memberPhones.length) {
      sendSmsCommandToSuperAdmin({
        alarmId: alarm._id.toString(),
        title: alarm.title,
        description: alarm.description || "",
        memberPhones,
      }).catch((err) => console.error("SMS_COMMAND dispatch error:", err.message));
    }
  }

  const existingLogs = await findOne(db.alarmLogs, {
    alarmId: alarm._id,
    slotId,
    status: "pending",
  });

  if (!existingLogs) {
    for (const userId of memberIds) {
      await insertNewDocument(db.alarmLogs, {
        alarmId: alarm._id,
        userId,
        slotId: slotId || null,
        status: "pending",
        enteredCode: null,
        stoppedAt: null,
      });
    }
  }

  return alarm.toObject();
};

const triggerAlarm = async (alarmId) => {
  const alarm = await findOne(db.alarms, {
    _id: alarmId,
    isDeleted: false,
  });

  if (!alarm) return null;

  if (alarm.schedules?.length) {
    const { findDueSlots } = require("../alarm-schedule");
    const due = findDueSlots(alarm);
    if (due.length) {
      return triggerAlarmSlot(alarmId, due[0].slotId);
    }
    return null;
  }

  if (alarm.status !== ALARM_STATUS.SCHEDULED) return null;
  return triggerAlarmSlot(alarmId, "legacy");
};

const completeSlotIfDone = async (alarmId) => {
  const alarm = await Models[db.alarms].findById(alarmId);
  if (!alarm) return;

  const pendingLogs = await find(db.alarmLogs, {
    alarmId,
    ...(alarm.activeSlotId ? { slotId: alarm.activeSlotId } : {}),
    status: "pending",
  });

  if (pendingLogs.length) return;

  if (allSlotsTriggered(alarm)) {
    alarm.status = ALARM_STATUS.COMPLETED;
    alarm.activeSlotId = null;
  } else {
    alarm.status = ALARM_STATUS.SCHEDULED;
    alarm.activeSlotId = null;
  }
  await alarm.save();
};

module.exports = {
  triggerAlarm,
  triggerAlarmSlot,
  completeSlotIfDone,
  ALARM_STATUS,
};
