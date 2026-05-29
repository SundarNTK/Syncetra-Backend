const exceptionHandler = require("../../utilities/handlers/exception-handler");
const messages = require("../../utilities/constants/messages");

const superAdminOnly = (req, res, next) => {
  if (req.user?.role !== "super_admin") {
    return exceptionHandler({ res, error: messages.FORBIDDEN, statusCode: 403 });
  }
  next();
};

module.exports = superAdminOnly;
