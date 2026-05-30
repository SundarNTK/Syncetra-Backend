const express = require("express");
const router = express.Router();
const { getMyProfile, updateMyProfile } = require("../../../controllers/users");

router.get("/profile", getMyProfile);
router.put("/profile", updateMyProfile);

module.exports = router;
