const express = require("express");
const router = express.Router();
const { publicTestTrigger } = require("../../controllers/alarms/public-test");

router.post("/test-trigger", publicTestTrigger);

module.exports = router;
