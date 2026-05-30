const express = require("express");
const router = express.Router();
const adminOnly = require("../../middleware/admin-only");
const dashboardRoutes = require("./dashboard");
const groupRoutes = require("./groups");
const alarmRoutes = require("./alarms");
const tripRoutes = require("./trips");
const userRoutes = require("./users");
const pollRoutes = require("./polls");
const profileRoutes = require("./profile");

router.use(adminOnly);
router.use(dashboardRoutes);
router.use(groupRoutes);
router.use(alarmRoutes);
router.use(tripRoutes);
router.use(userRoutes);
router.use(pollRoutes);
router.use(profileRoutes);

module.exports = router;
