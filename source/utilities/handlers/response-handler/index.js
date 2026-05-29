const responseHandler = ({
  res,
  response = null,
  statusCode = 200,
  message = "Success",
  recordsCount = null,
}) => {
  const payload = {
    success: true,
    statusCode,
    data: response,
    message,
  };
  if (recordsCount !== null) payload.recordsCount = recordsCount;
  return res.status(statusCode).json(payload);
};

module.exports = responseHandler;
