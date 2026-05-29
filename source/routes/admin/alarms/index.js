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
  getAlarmLogs,
  getAlarmMemberPhones,
} = require("../../../controllers/alarms");

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

module.exports = router;
