const exceptionHandler = require("../../utilities/handlers/exception-handler");
const messages = require("../../utilities/constants/messages");
const Env = require("../../configurations/environment");

const adminOnly = (req, res, next) => {
  const role = req.user?.role;
  if (role !== Env.ROLES.ADMIN && role !== Env.ROLES.SUPER_ADMIN) {
    return exceptionHandler({ res, error: messages.FORBIDDEN, statusCode: 403 });
  }
  next();
};

module.exports = adminOnly;
