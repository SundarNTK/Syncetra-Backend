const mongoose = require("mongoose");
const db = require("../../utilities/constants/db-name");
const messages = require("../../utilities/constants/messages");
const responseHandler = require("../../utilities/handlers/response-handler");
const exceptionHandler = require("../../utilities/handlers/exception-handler");
const {
  find,
  findOne,
  insertNewDocument,
} = require("../../utilities/helpers/mongo-query");
const { generateStopCode, generateUniqueId } = require("../../utilities/helpers/generic");
const {
  triggerAlarmSlot,
  ALARM_STATUS,
} = require("../../utilities/helpers/alarm-trigger");

const testTriggerByMobile = async (req, res) => {
  try {
    const { mobileNumber, groupId, title, description } = req.body;
    if (!mobileNumber) throw "mobileNumber is required";

    const user = await findOne(db.users, {
      mobileNumber: String(mobileNumber).replace(/\D/g, ""),
      isDeleted: false,
    });
    if (!user) {
      throw "No user with this mobile. Add member to a group first (name + email + mobile).";
    }

    let group;
    if (groupId) {
      group = await findOne(db.groups, {
        _id: groupId,
        createdBy: req.user.userId,
        members: user._id,
        isDeleted: false,
      });
      if (!group) throw "User is not in the selected group";
    } else {
      group = await findOne(db.groups, {
        createdBy: req.user.userId,
        members: user._id,
        isDeleted: false,
      });
      if (!group) throw "User is not in any of your groups";
    }

    const stopCode = generateStopCode();
    const slotId = `test-${generateUniqueId()}`;
    const alarm = await insertNewDocument(db.alarms, {
      groupId: group._id,
      title: title || "Test Alarm",
      description:
        description ||
        `Test alert for mobile ${user.mobileNumber}. Open app on phone with notifications enabled.`,
      schedules: [],
      stopCode,
      isEmergency: true,
      status: ALARM_STATUS.SCHEDULED,
      createdBy: req.user.userId,
    });

    const triggered = await triggerAlarmSlot(alarm._id, slotId);
    if (!triggered) throw "Failed to trigger alarm";

    return responseHandler({
      res,
      message: "Test alarm triggered",
      response: {
        alarmId: alarm._id,
        stopCode,
        alertMessage: description || alarm.description,
        groupName: group.groupName,
        targetUser: {
          name: user.name,
          email: user.email,
          mobileNumber: user.mobileNumber,
          hasFcmToken: !!user.fcmToken,
        },
        hint: user.fcmToken
          ? "Member should hear alarm if app is open or in background"
          : "No FCM token — member must login on phone as USER and allow notifications",
      },
    });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

module.exports = { testTriggerByMobile };
