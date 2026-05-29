const cron = require("node-cron");
const db = require("../../constants/db-name");
const { find } = require("../../helpers/mongo-query");
const { triggerAlarmSlot, ALARM_STATUS } = require("../../helpers/alarm-trigger");
const { findDueSlots } = require("../../helpers/alarm-schedule");

const checkDueAlarms = async () => {
  const now = new Date();

  const scheduledAlarms = await find(db.alarms, {
    status: { $in: [ALARM_STATUS.SCHEDULED, ALARM_STATUS.ACTIVE] },
    isDeleted: false,
  });

  for (const alarm of scheduledAlarms) {
    if (alarm.status === ALARM_STATUS.ACTIVE) continue;

    if (alarm.schedules?.length) {
      const dueSlots = findDueSlots(alarm, now);
      for (const slot of dueSlots) {
        try {
          await triggerAlarmSlot(alarm._id, slot.slotId);
          console.log(
            `Alarm slot triggered: ${alarm.title} [${slot.scheduleDate} ${slot.slotId}]`
          );
        } catch (err) {
          console.error(`Failed slot ${alarm._id}:`, err.message);
        }
      }
      continue;
    }

    if (alarm.alarmTime && new Date(alarm.alarmTime) <= now) {
      try {
        await triggerAlarmSlot(alarm._id, "legacy");
        console.log(`Legacy alarm triggered: ${alarm.title}`);
      } catch (err) {
        console.error(`Failed alarm ${alarm._id}:`, err.message);
      }
    }
  }
};

cron.schedule("* * * * *", async () => {
  await checkDueAlarms();
});

module.exports = { checkDueAlarms };
