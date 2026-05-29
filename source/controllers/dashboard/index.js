const mongoose = require("mongoose");
const db = require("../../utilities/constants/db-name");
const responseHandler = require("../../utilities/handlers/response-handler");
const exceptionHandler = require("../../utilities/handlers/exception-handler");
const { find, findOne } = require("../../utilities/helpers/mongo-query");
const { ALARM_STATUS } = require("../../utilities/helpers/alarm-trigger");

const getAdminDashboard = async (req, res) => {
  try {
    const adminId = new mongoose.Types.ObjectId(req.user.userId);

    const groups = await find(db.groups, {
      createdBy: adminId,
      isDeleted: false,
    });

    const groupIds = groups.map((g) => g._id);
    const memberIdSet = new Set();
    groups.forEach((g) => {
      (g.members || []).forEach((m) => memberIdSet.add(m.toString()));
    });

    const alarms = groupIds.length
      ? await find(db.alarms, { groupId: { $in: groupIds }, isDeleted: false })
      : [];

    const activeAlarms = alarms.filter((a) => a.status === ALARM_STATUS.ACTIVE);
    const scheduledAlarms = alarms.filter(
      (a) => a.status === ALARM_STATUS.SCHEDULED
    );
    const completedAlarms = alarms.filter(
      (a) => a.status === ALARM_STATUS.COMPLETED
    );

    const statusChart = [
      { name: "Active", value: activeAlarms.length, color: "#ef4444" },
      { name: "Scheduled", value: scheduledAlarms.length, color: "#3b82f6" },
      { name: "Completed", value: completedAlarms.length, color: "#22c55e" },
      { name: "Cancelled", value: alarms.filter((a) => a.status === ALARM_STATUS.CANCELLED).length, color: "#64748b" },
    ];

    return responseHandler({
      res,
      response: {
        totalGroups: groups.length,
        activeGroups: groups.filter((g) => (g.members || []).length > 0).length,
        totalUsers: memberIdSet.size,
        totalAlarms: alarms.length,
        activeAlarms: activeAlarms.length,
        scheduledAlarms: scheduledAlarms.length,
        statusChart,
        recentAlarms: alarms.slice(0, 8),
        groups: groups.slice(0, 6),
      },
    });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const getUserDashboard = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.userId);

    const groups = await find(db.groups, {
      members: userId,
      isDeleted: false,
    });

    const groupIds = groups.map((g) => g._id);
    const alarms = groupIds.length
      ? await find(db.alarms, {
          groupId: { $in: groupIds },
          isDeleted: false,
        })
      : [];

    const activeAlarm = await findOne(db.alarms, {
      groupId: { $in: groupIds },
      status: ALARM_STATUS.ACTIVE,
      isDeleted: false,
    });

    const { stopCode, ...safeActive } = activeAlarm || {};

    return responseHandler({
      res,
      response: {
        totalGroups: groups.length,
        totalAlarms: alarms.length,
        activeAlarms: alarms.filter((a) => a.status === ALARM_STATUS.ACTIVE).length,
        completedAlarms: alarms.filter((a) => a.status === ALARM_STATUS.COMPLETED).length,
        activeAlarm: activeAlarm ? safeActive : null,
        recentAlarms: alarms.slice(0, 6),
        groups: groups.slice(0, 6),
        statusChart: [
          { name: "Active", value: alarms.filter((a) => a.status === ALARM_STATUS.ACTIVE).length, color: "#ef4444" },
          { name: "Scheduled", value: alarms.filter((a) => a.status === ALARM_STATUS.SCHEDULED).length, color: "#3b82f6" },
          { name: "Completed", value: alarms.filter((a) => a.status === ALARM_STATUS.COMPLETED).length, color: "#22c55e" },
        ],
      },
    });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

module.exports = { getAdminDashboard, getUserDashboard };
