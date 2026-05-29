const Joi = require("joi");

const registerSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(30).required(),
  name: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required(),
  mobileNumber: Joi.string().pattern(/^[0-9]{10,15}$/).required(),
});

const loginSchema = Joi.object({
  // accepts email address or username
  identifier: Joi.string().required(),
  password: Joi.string().required(),
});

const verifySetupTokenSchema = Joi.object({
  token: Joi.string().required(),
});

const createPasswordSchema = Joi.object({
  token: Joi.string().required(),
  password: Joi.string().min(6).required(),
  confirmPassword: Joi.any()
    .valid(Joi.ref("password"))
    .required()
    .messages({ "any.only": "Passwords do not match" }),
});

module.exports = {
  registerSchema,
  loginSchema,
  verifySetupTokenSchema,
  createPasswordSchema,
};
