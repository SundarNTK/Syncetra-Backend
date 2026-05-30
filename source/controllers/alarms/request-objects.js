const Joi = require("joi");

const timeSlotSchema = Joi.object({
  time: Joi.string()
    .pattern(/^([01]\d|2[0-3]):[0-5]\d$/)
    .required(),
  status: Joi.string().valid("active", "inactive").default("active"),
  slotId: Joi.string().optional(),
});

const dateScheduleSchema = Joi.object({
  date: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .required(),
  status: Joi.string().valid("active", "inactive").default("active"),
  times: Joi.array().items(timeSlotSchema).min(1).required(),
});

const alarmTargetSchema = {
  targetType: Joi.string()
    .valid("group_all", "trip_all", "selected")
    .default("group_all")
    .optional(),
  targetMemberIds: Joi.array().items(Joi.string()).optional(),
};

const scheduleAlarmSchema = Joi.object({
  groupId: Joi.string().required(),
  title: Joi.string().min(2).max(200).required(),
  description: Joi.string().max(500).optional().allow(""),
  schedules: Joi.array().items(dateScheduleSchema).min(1).required(),
  repeatType: Joi.string().valid("none", "daily", "weekly").default("none"),
  soundType: Joi.string().valid("beep", "siren", "urgent", "chime").default("siren").optional(),
  ...alarmTargetSchema,
});

const emergencyAlarmSchema = Joi.object({
  groupId: Joi.string().required(),
  title: Joi.string().min(2).max(200).required(),
  description: Joi.string().max(500).optional().allow(""),
  soundType: Joi.string().valid("beep", "siren", "urgent", "chime").default("siren").optional(),
  ...alarmTargetSchema,
});

const stopAlarmSchema = Joi.object({
  code: Joi.string()
    .length(4)
    .pattern(/^[0-9]{4}$/)
    .required(),
});

module.exports = { scheduleAlarmSchema, emergencyAlarmSchema, stopAlarmSchema };
