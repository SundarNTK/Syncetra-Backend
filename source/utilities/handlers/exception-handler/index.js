const resolveExceptionMessage = require("../../exceptions");

const exceptionHandler = ({ res, error, statusCode = 400 }) => {
  const message = resolveExceptionMessage(error);
  return res.status(statusCode).json({
    success: false,
    statusCode,
    message,
  });
};

module.exports = exceptionHandler;
