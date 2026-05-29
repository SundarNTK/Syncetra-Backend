const db = require("../../utilities/constants/db-name");
const Env = require("../../configurations/environment");
const responseHandler = require("../../utilities/handlers/response-handler");
const exceptionHandler = require("../../utilities/handlers/exception-handler");
const { findOne } = require("../../utilities/helpers/mongo-query");
const { testTriggerByMobile } = require("./test-trigger-handler");

/**
 * Public test endpoint — DEV only, or TEST_ALARM_SECRET in body for PROD testing.
 */
const publicTestTrigger = async (req, res) => {
  try {
    const secret = req.body?.secret || req.headers["x-test-secret"];
    const allowed =
      Env.APP_ENV === "DEV" ||
      (Env.TEST_ALARM_SECRET && secret === Env.TEST_ALARM_SECRET);

    if (!allowed) {
      return exceptionHandler({
        res,
        error: "Public test is disabled. Login as admin or set APP_ENV=DEV",
        statusCode: 403,
      });
    }

    const admin = await findOne(db.users, {
      role: Env.ROLES.ADMIN,
      isDeleted: false,
    });
    if (!admin) {
      throw "No admin user in database. Register an admin account first.";
    }

    req.user = {
      userId: admin._id.toString(),
      role: Env.ROLES.ADMIN,
      name: admin.name,
    };

    return testTriggerByMobile(req, res);
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

module.exports = { publicTestTrigger };
