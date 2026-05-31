const express = require("express");
const router = express.Router();
const superAdminOnly = require("../../../middleware/super-admin-only");
const adminOnly = require("../../../middleware/admin-only");
const {
  getPolls, getPoll, createPoll, updatePoll, deletePoll, getPollAnalytics,
} = require("../../../controllers/polls");

router.get("/polls", getPolls);
router.get("/polls/:id", getPoll);
router.get("/polls/:id/analytics", getPollAnalytics);
router.post("/polls", superAdminOnly, createPoll);
router.put("/polls/:id", adminOnly, updatePoll);
router.delete("/polls/:id", adminOnly, deletePoll);

module.exports = router;
