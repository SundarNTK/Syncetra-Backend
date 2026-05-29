const express = require("express");
const router = express.Router();
const {
  getUserActiveAlarm,
  stopAlarm,
  getUserAlarmHistory,
} = require("../../../controllers/alarms");

router.get("/alarms/active", getUserActiveAlarm);
router.get("/alarms/history", getUserAlarmHistory);
router.post("/alarms/:id/stop", stopAlarm);

module.exports = router;
