const express = require("express");
const router = express.Router();
const { getAdminDashboard } = require("../../../controllers/dashboard");

router.get("/dashboard", getAdminDashboard);

module.exports = router;
