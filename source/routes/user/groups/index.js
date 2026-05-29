const express = require("express");
const router = express.Router();
const { findUserGroups } = require("../../../controllers/groups");

router.get("/groups", findUserGroups);

module.exports = router;
