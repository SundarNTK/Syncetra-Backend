const express = require("express");
const router = express.Router();
const {
  register,
  login,
  verifySetupToken,
  createPassword,
  updateFcmToken,
  changePassword,
  forgotPassword,
  resetPassword,
} = require("../../controllers/auth");
const { authenticate } = require("../../middleware/authenticate");

router.post("/register", register);
router.post("/login", login);
router.post("/verify-setup-token", verifySetupToken);
router.post("/create-password", createPassword);
router.put("/fcm-token", authenticate, updateFcmToken);
router.put("/change-password", authenticate, changePassword);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

module.exports = router;
