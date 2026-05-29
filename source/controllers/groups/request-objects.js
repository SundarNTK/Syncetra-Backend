const Joi = require("joi");

const memberSchema = Joi.object({
  name: Joi.string().min(2).required(),
  email: Joi.string().email().required(),
  mobileNumber: Joi.string().pattern(/^[0-9]{10,15}$/).required(),
});

const createGroupSchema = Joi.object({
  groupName: Joi.string().min(2).max(100).required(),
  tripId: Joi.string().optional().allow("", null),
  members: Joi.array().items(memberSchema).optional(),
});

const updateGroupSchema = Joi.object({
  groupName: Joi.string().min(2).max(100).optional(),
  tripId: Joi.string().optional().allow("", null),
  members: Joi.array().items(memberSchema).optional(),
});

// Add by existing userId OR by raw name+email+mobile (legacy / create-group flow)
const addMemberSchema = Joi.object({
  userId: Joi.string().optional(),
  name: Joi.string().min(2).when("userId", {
    is: Joi.exist(), then: Joi.optional(), otherwise: Joi.required(),
  }),
  email: Joi.string().email().when("userId", {
    is: Joi.exist(), then: Joi.optional(), otherwise: Joi.required(),
  }),
  mobileNumber: Joi.string().pattern(/^[0-9]{10,15}$/).when("userId", {
    is: Joi.exist(), then: Joi.optional(), otherwise: Joi.required(),
  }),
});

const updateMemberSchema = Joi.object({
  name: Joi.string().min(2).required(),
  mobileNumber: Joi.string().pattern(/^[0-9]{10,15}$/).required(),
});

module.exports = {
  createGroupSchema,
  updateGroupSchema,
  addMemberSchema,
  updateMemberSchema,
};
