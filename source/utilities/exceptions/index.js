const resolveExceptionMessage = (error) => {
  if (!error) return "Something went wrong";

  if (typeof error === "string") return error;

  if (error.isJoi && error.details?.length) {
    return error.details[0].message;
  }

  if (error.code === 11000) {
    const field = Object.keys(error.keyPattern || {})[0] || "field";
    return `${field} already exists`;
  }

  return error.message || "Something went wrong";
};

module.exports = resolveExceptionMessage;
