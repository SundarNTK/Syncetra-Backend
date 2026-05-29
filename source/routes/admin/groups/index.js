const express = require("express");
const router = express.Router();
const {
  createGroup,
  findAllGroups,
  findOneGroup,
  updateGroup,
  deleteGroup,
  addMember,
  updateMember,
  removeMember,
} = require("../../../controllers/groups");

router.post("/groups", createGroup);
router.get("/groups", findAllGroups);
router.get("/groups/:id", findOneGroup);
router.put("/groups/:id", updateGroup);
router.delete("/groups/:id", deleteGroup);
router.post("/groups/:id/members", addMember);
router.put("/groups/:id/members/:memberId", updateMember);
router.delete("/groups/:id/members/:memberId", removeMember);

module.exports = router;
