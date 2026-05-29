const jwt = require("jsonwebtoken");
const db = require("../../utilities/constants/db-name");
const validateRequest = require("../../utilities/validations/validate-request");
const responseHandler = require("../../utilities/handlers/response-handler");
const exceptionHandler = require("../../utilities/handlers/exception-handler");
const {
  find,
  findOne,
  insertNewDocument,
  updateDocument,
} = require("../../utilities/helpers/mongo-query");
const Env = require("../../configurations/environment");
const { sendPasswordSetupEmail } = require("../../service/email");
const { createMemberSchema, updateUserSchema } = require("./request-objects");

const normalizeEmail = (e) => e.trim().toLowerCase();
const normalizeUsername = (u) => u.trim().toLowerCase();

const signSetupToken = (userId) =>
  jwt.sign(
    { userId: String(userId), purpose: "password-setup" },
    Env.PASSWORD_SETUP_SECRET,
    { expiresIn: Env.PASSWORD_SETUP_EXPIRES }
  );

const buildSetupUrl = (token) => {
  const base = (Env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
  return `${base}/#/create-password?token=${token}`;
};

// GET /users?role=user|admin|super_admin
// Accessible by admin + super_admin (enforced by adminOnly middleware upstream)
const getUsers = async (req, res) => {
  try {
    const { role } = req.query;
    const query = { isDeleted: false };

    if (role === "admin") {
      query.role = { $in: ["admin", "super_admin"] };
    } else if (role) {
      query.role = role;
    } else {
      query.role = "user";
    }

    const users = await find(db.users, query, { createdAt: -1 });

    const safe = users.map((u) => ({
      id: u._id,
      username: u.username || null,
      name: u.name,
      email: u.email,
      mobileNumber: u.mobileNumber,
      role: u.role,
      profileImage: u.profileImage || null,
      hasPassword: !!u.password,
      hasFcmToken: !!(u.fcmToken && u.fcmToken.length > 0),
      createdAt: u.createdAt,
    }));

    return responseHandler({ res, response: safe, recordsCount: safe.length });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

// POST /users  — super_admin only (enforced in route)
const createMember = async (req, res) => {
  try {
    const body = validateRequest({ schema: createMemberSchema, body: req.body });

    const normalizedEmail = normalizeEmail(body.email);
    const normalizedUsername = normalizeUsername(body.username);

    const emailTaken = await findOne(db.users, {
      email: normalizedEmail,
      isDeleted: false,
    });
    if (emailTaken) throw "Email is already in use.";

    const usernameTaken = await findOne(db.users, {
      username: normalizedUsername,
      isDeleted: false,
    });
    if (usernameTaken) throw "Username is already taken. Please choose another.";

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
      statusCode: 201,
      message: "Member created. Password setup email sent.",
      response: {
        user: {
          id: user._id,
          username: user.username,
          name: user.name,
          email: user.email,
          mobileNumber: user.mobileNumber,
          role: user.role,
          hasPassword: false,
        },
        emailSent: emailResult?.sent ?? false,
        ...(Env.APP_ENV !== "PROD" ? { setupUrl } : {}),
      },
    });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

// PUT /users/:id  — admin can edit members, super_admin can edit anyone
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const body = validateRequest({ schema: updateUserSchema, body: req.body });

    const target = await findOne(db.users, { _id: id, isDeleted: false });
    if (!target) throw "User not found.";

    // Admins may only edit member-role users; super_admin can edit anyone
    if (req.user.role !== "super_admin" && target.role !== "user") {
      throw "You do not have permission to edit this user.";
    }

    const update = {};
    if (body.name)          update.name          = body.name;
    if (body.mobileNumber)  update.mobileNumber  = body.mobileNumber;
    if (body.profileImage !== undefined) update.profileImage = body.profileImage || null;

    const updated = await updateDocument(db.users, { _id: id, isDeleted: false }, update);
    if (!updated) throw "User not found.";

    return responseHandler({
      res,
      message: "User updated.",
      response: {
        id: updated._id,
        username: updated.username || null,
        name: updated.name,
        email: updated.email,
        mobileNumber: updated.mobileNumber,
        role: updated.role,
        profileImage: updated.profileImage || null,
        hasPassword: !!updated.password,
        hasFcmToken: !!(updated.fcmToken && updated.fcmToken.length > 0),
      },
    });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

module.exports = { getUsers, createMember, updateUser };
