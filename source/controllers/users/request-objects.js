const Joi = require("joi");

const createMemberSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(30).required(),
  name: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required(),
  mobileNumber: Joi.string().pattern(/^[0-9]{10,15}$/).required(),
});

const updateUserSchema = Joi.object({
  name: Joi.string().min(2).max(100).optional(),
  mobileNumber: Joi.string().pattern(/^[0-9]{10,15}$/).optional(),
  profileImage: Joi.string().allow("", null).optional(),
}).min(1);

module.exports = { createMemberSchema, updateUserSchema };
