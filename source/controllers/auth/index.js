const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../../utilities/constants/db-name");
const validateRequest = require("../../utilities/validations/validate-request");
const responseHandler = require("../../utilities/handlers/response-handler");
const exceptionHandler = require("../../utilities/handlers/exception-handler");
const {
  findOne,
  insertNewDocument,
  updateDocument,
} = require("../../utilities/helpers/mongo-query");
const { signToken } = require("../../utilities/helpers/jwt");
const Env = require("../../configurations/environment");
const {
  sendPasswordSetupEmail,
  sendPasswordChangedEmail,
  sendPasswordResetOtpEmail,
  isEmailConfigured,
} = require("../../service/email");
const {
  registerSchema,
  loginSchema,
  verifySetupTokenSchema,
  createPasswordSchema,
} = require("./request-objects");

const SALT_ROUNDS = 12;
const normalizeEmail = (email) => email.trim().toLowerCase();
const normalizeUsername = (u) => u.trim().toLowerCase();

// ─── Helpers ──────────────────────────────────────────────────────────────────

const signSetupToken = (userId) =>
  jwt.sign(
    { userId: String(userId), purpose: "password-setup" },
    Env.PASSWORD_SETUP_SECRET,
    { expiresIn: Env.PASSWORD_SETUP_EXPIRES }
  );

const verifySetupTokenPayload = (token) => {
  try {
    const decoded = jwt.verify(token, Env.PASSWORD_SETUP_SECRET);
    if (decoded.purpose !== "password-setup") throw new Error("Wrong token purpose");
    return decoded;
  } catch (err) {
    if (err.name === "TokenExpiredError") throw "Setup link has expired. Ask your admin to resend it.";
    throw "Invalid or tampered setup link.";
  }
};

const buildSetupUrl = (token) => {
  const base = (Env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
  // HashRouter URLs use /#/path format
  return `${base}/#/create-password?token=${token}`;
};

const buildSessionUser = (user) => ({
  id: user._id,
  username: user.username,
  name: user.name,
  email: user.email,
  mobileNumber: user.mobileNumber,
  role: user.role,
  profileImage: user.profileImage || null,
});

// ─── register ────────────────────────────────────────────────────────────────
// Creates a new user account (no password yet) and sends setup email.
const register = async (req, res) => {
  try {
    const body = validateRequest({ schema: registerSchema, body: req.body });

    const normalizedEmail = normalizeEmail(body.email);
    const normalizedUsername = normalizeUsername(body.username);

    // Email uniqueness
    const emailTaken = await findOne(db.users, {
      email: normalizedEmail,
      isDeleted: false,
    });
    if (emailTaken) throw "Email already in use. Please login instead.";

    // Username uniqueness
    const usernameTaken = await findOne(db.users, {
      username: normalizedUsername,
      isDeleted: false,
    });
    if (usernameTaken) throw "Username already taken. Please choose another.";

    const user = await insertNewDocument(db.users, {
      username: normalizedUsername,
      name: body.name,
      email: normalizedEmail,
      mobileNumber: body.mobileNumber,
      role: "user",
    });

    const setupToken = signSetupToken(user._id);
    const setupUrl = buildSetupUrl(setupToken);

    const emailResult = await sendPasswordSetupEmail(normalizedEmail, {
      name: body.name,
      setupUrl,
    });

    return responseHandler({
      res,
      message: "Registration successful. Check your email to set up your password.",
      response: {
        emailSent: emailResult.sent,
        // Only expose setupUrl in DEV so developers can test without email
        ...(Env.APP_ENV !== "PROD" ? { setupUrl } : {}),
      },
    });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

// ─── login ───────────────────────────────────────────────────────────────────
// Accepts email or username + password. Returns JWT session token.
const login = async (req, res) => {
  try {
    const { identifier, password } = validateRequest({
      schema: loginSchema,
      body: req.body,
    });

    const normalized = identifier.trim().toLowerCase();
    const isEmail = normalized.includes("@");

    const user = await findOne(db.users, {
      ...(isEmail ? { email: normalized } : { username: normalized }),
      isDeleted: false,
    });

    if (!user) {
      throw isEmail
        ? "No account found with this email."
        : "No account found with this username.";
    }

    if (!user.password) {
      throw "Password not set. Please check your email for the setup link.";
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) throw "Incorrect password.";

    const token = signToken({
      userId: user._id.toString(),
      email: user.email,
      username: user.username,
      mobileNumber: user.mobileNumber,
      role: user.role,
      name: user.name,
    });

    return responseHandler({
      res,
      message: "Login successful",
      response: { token, user: buildSessionUser(user) },
    });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

// ─── verifySetupToken ─────────────────────────────────────────────────────────
// Decodes the token from the email link and returns the user's name for the
// greeting popup on the create-password page.
const verifySetupToken = async (req, res) => {
  try {
    const { token } = validateRequest({
      schema: verifySetupTokenSchema,
      body: req.body,
    });

    const { userId } = verifySetupTokenPayload(token);

    const user = await findOne(db.users, { _id: userId, isDeleted: false });
    if (!user) throw "Account not found or deleted.";

    return responseHandler({
      res,
      message: "Token valid",
      response: { name: user.name, username: user.username, hasPassword: !!user.password },
    });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

// ─── createPassword ───────────────────────────────────────────────────────────
// Hashes and stores the user's password, then auto-logs them in.
const createPassword = async (req, res) => {
  try {
    const { token, password } = validateRequest({
      schema: createPasswordSchema,
      body: req.body,
    });

    const { userId } = verifySetupTokenPayload(token);

    const user = await findOne(db.users, { _id: userId, isDeleted: false });
    if (!user) throw "Account not found or deleted.";

    const hashed = await bcrypt.hash(password, SALT_ROUNDS);

    const updated = await updateDocument(db.users, { _id: userId }, { password: hashed });
    if (!updated) throw "Failed to save password. Please try again.";

    // Auto-login: issue a full session token so the user lands in the app directly
    const sessionToken = signToken({
      userId: user._id.toString(),
      email: user.email,
      username: user.username,
      mobileNumber: user.mobileNumber,
      role: user.role,
      name: user.name,
    });

    return responseHandler({
      res,
      message: "Password created successfully.",
      response: {
        token: sessionToken,
        user: buildSessionUser(user),
      },
    });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

// ─── updateFcmToken ───────────────────────────────────────────────────────────
const updateFcmToken = async (req, res) => {
  try {
    const { fcmToken } = req.body;
    if (!fcmToken) throw "FCM token is required";
    await updateDocument(db.users, { _id: req.user.userId }, { fcmToken });
    return responseHandler({ res, message: "FCM token updated" });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

// ─── changePassword ───────────────────────────────────────────────────────────
// Authenticated users change their own password with old + new password.
const changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) throw "oldPassword and newPassword are required";
    if (newPassword.length < 6) throw "New password must be at least 6 characters";

    const user = await findOne(db.users, { _id: req.user.userId, isDeleted: false });
    if (!user) throw "Account not found";
    if (!user.password) throw "No password set. Use the setup link from your email.";

    const matches = await bcrypt.compare(oldPassword, user.password);
    if (!matches) throw "Current password is incorrect";

    const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await updateDocument(db.users, { _id: req.user.userId }, { password: hashed });

    sendPasswordChangedEmail(user.email, { name: user.name }).catch(() => {});

    return responseHandler({ res, message: "Password changed successfully" });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

// ─── forgotPassword ───────────────────────────────────────────────────────────
// Sends a 6-digit OTP to the user's email. OTP lives in the otps collection.
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) throw "Email is required";

    const normalized = normalizeEmail(email);
    const user = await findOne(db.users, { email: normalized, isDeleted: false });
    // Always return success to avoid email enumeration
    if (!user) {
      return responseHandler({ res, message: "If this email is registered, an OTP has been sent." });
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + Env.OTP_EXPIRY_MINUTES * 60 * 1000);

    // Remove any existing OTPs for this email (one active at a time)
    await require("../../models")[db.otps].deleteMany({ email: normalized });
    await insertNewDocument(db.otps, { email: normalized, otp, expiresAt });

    const emailResult = await sendPasswordResetOtpEmail(normalized, {
      name: user.name,
      otp,
      expiryMinutes: Env.OTP_EXPIRY_MINUTES,
    });

    return responseHandler({
      res,
      message: "If this email is registered, an OTP has been sent.",
      response: {
        // Expose OTP in DEV only so developers can test without email
        ...(Env.APP_ENV !== "PROD" ? { otp } : {}),
        emailSent: emailResult.sent,
      },
    });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

// ─── resetPassword ────────────────────────────────────────────────────────────
// Verifies OTP and updates the password, then sends a confirmation email.
const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) throw "email, otp, and newPassword are required";
    if (newPassword.length < 6) throw "New password must be at least 6 characters";

    const normalized = normalizeEmail(email);
    const Models = require("../../models");

    const record = await Models[db.otps].findOne({
      email: normalized,
      otp: String(otp),
      expiresAt: { $gt: new Date() },
    });
    if (!record) throw "Invalid or expired OTP. Please request a new one.";

    const user = await findOne(db.users, { email: normalized, isDeleted: false });
    if (!user) throw "Account not found";

    const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await updateDocument(db.users, { _id: user._id }, { password: hashed });
    await Models[db.otps].deleteMany({ email: normalized });

    sendPasswordChangedEmail(normalized, { name: user.name }).catch(() => {});

    return responseHandler({ res, message: "Password reset successfully. You can now log in." });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

module.exports = {
  register,
  login,
  verifySetupToken,
  createPassword,
  updateFcmToken,
  changePassword,
  forgotPassword,
  resetPassword,
};
