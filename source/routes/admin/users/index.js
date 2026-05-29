const express = require("express");
const router = express.Router();
const { getUsers, createMember, updateUser } = require("../../../controllers/users");
const superAdminOnly = require("../../../middleware/super-admin-only");

router.get("/users", getUsers);
router.post("/users", superAdminOnly, createMember);
router.put("/users/:id", updateUser);

module.exports = router;
