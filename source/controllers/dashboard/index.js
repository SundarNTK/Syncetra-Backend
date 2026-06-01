const mongoose = require("mongoose");
const db = require("../../utilities/constants/db-name");
const responseHandler = require("../../utilities/handlers/response-handler");
const exceptionHandler = require("../../utilities/handlers/exception-handler");
const { find, findOne } = require("../../utilities/helpers/mongo-query");
const { ALARM_STATUS } = require("../../utilities/helpers/alarm-trigger");

const alarmStatusKey = (alarm) => (alarm?.status || "").toLowerCase();

const countAlarmsByStatus = (alarms, status) =>
  alarms.filter((a) => alarmStatusKey(a) === status).length;

const buildStatusChart = (alarms) => [
  { name: "Active", value: countAlarmsByStatus(alarms, ALARM_STATUS.ACTIVE), color: "#ef4444" },
  { name: "Scheduled", value: countAlarmsByStatus(alarms, ALARM_STATUS.SCHEDULED), color: "#3b82f6" },
  { name: "Completed", value: countAlarmsByStatus(alarms, ALARM_STATUS.COMPLETED), color: "#22c55e" },
  { name: "Cancelled", value: countAlarmsByStatus(alarms, ALARM_STATUS.CANCELLED), color: "#64748b" },
];

const getAdminDashboard = async (req, res) => {
  try {
    const groups = await find(db.groups, { isDeleted: false });

    const memberIdSet = new Set();
    groups.forEach((g) => {
      (g.members || []).forEach((m) => memberIdSet.add(m.toString()));
    });

    const alarms = await find(db.alarms, { isDeleted: false }, { createdAt: -1 });

    const statusChart = buildStatusChart(alarms);

    return responseHandler({
      res,
      response: {
        totalGroups: groups.length,
        activeGroups: groups.filter((g) => (g.members || []).length > 0).length,
        totalUsers: memberIdSet.size,
        totalAlarms: alarms.length,
        activeAlarms: countAlarmsByStatus(alarms, ALARM_STATUS.ACTIVE),
        scheduledAlarms: countAlarmsByStatus(alarms, ALARM_STATUS.SCHEDULED),
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
        }, { createdAt: -1 })
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
        activeAlarms: countAlarmsByStatus(alarms, ALARM_STATUS.ACTIVE),
        completedAlarms: countAlarmsByStatus(alarms, ALARM_STATUS.COMPLETED),
        activeAlarm: activeAlarm ? safeActive : null,
        recentAlarms: alarms.slice(0, 6),
        groups: groups.slice(0, 6),
        statusChart: buildStatusChart(alarms),
      },
    });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

module.exports = { getAdminDashboard, getUserDashboard };
