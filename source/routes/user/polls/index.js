const express = require("express");
const router = express.Router();
const { getPolls, getPoll, votePoll } = require("../../../controllers/polls");

router.get("/polls", getPolls);
router.get("/polls/:id", getPoll);
router.post("/polls/:id/vote", votePoll);

module.exports = router;
