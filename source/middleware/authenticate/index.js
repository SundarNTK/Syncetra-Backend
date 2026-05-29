const { verifyToken } = require("../../utilities/helpers/jwt");
const exceptionHandler = require("../../utilities/handlers/exception-handler");
const messages = require("../../utilities/constants/messages");

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return exceptionHandler({
      res,
      error: messages.UNAUTHORIZED,
      statusCode: 401,
    });
  }

  try {
    const token = authHeader.slice(7);
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch {
    return exceptionHandler({
      res,
      error: messages.UNAUTHORIZED,
      statusCode: 401,
    });
  }
};

module.exports = { authenticate };
