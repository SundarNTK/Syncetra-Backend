const express = require("express");
const router = express.Router();
const dashboardRoutes = require("./dashboard");
const groupRoutes = require("./groups");
const alarmRoutes = require("./alarms");
const tripRoutes = require("./trips");
const pollRoutes = require("./polls");
const profileRoutes = require("./profile");

router.use(dashboardRoutes);
router.use(groupRoutes);
router.use(alarmRoutes);
router.use(tripRoutes);
router.use(pollRoutes);
router.use(profileRoutes);

module.exports = router;
