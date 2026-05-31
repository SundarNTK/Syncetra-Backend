const express = require("express");
const router = express.Router();
const {
  scheduleAlarm,
  triggerEmergency,
  testTriggerByMobile,
  triggerAlarmNow,
  findAllAlarms,
  findActiveAlarms,
  getStopCode,
  cancelAlarm,
  deleteAlarm,
  getAlarmLogs,
  getAlarmMemberPhones,
} = require("../../../controllers/alarms");
const superAdminOnly = require("../../../middleware/super-admin-only");

router.post("/alarms", scheduleAlarm);
router.post("/alarms/emergency", triggerEmergency);
router.post("/alarms/test-trigger", testTriggerByMobile);
router.post("/alarms/:id/trigger-now", triggerAlarmNow);
router.get("/alarms", findAllAlarms);
router.get("/alarms/active", findActiveAlarms);
router.get("/alarms/:id/stop-code", getStopCode);
router.get("/alarms/:id/logs", getAlarmLogs);
router.put("/alarms/:id/cancel", cancelAlarm);
router.get("/alarms/:id/member-phones", getAlarmMemberPhones);
router.delete("/alarms/:id", superAdminOnly, deleteAlarm);

module.exports = router;
