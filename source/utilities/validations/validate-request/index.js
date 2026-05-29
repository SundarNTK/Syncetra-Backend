const validateRequest = ({ schema, body, method = "POST" }) => {
  const { error, value } = schema.validate(body, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (error) throw error;
  return value;
};

module.exports = validateRequest;
