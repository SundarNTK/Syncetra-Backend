const { generateUniqueId } = require("../generic");

const normalizeSchedules = (schedules = []) => {
  return schedules.map((s) => ({
    date: s.date,
    status: s.status || "active",
    times: (s.times || []).map((t) => ({
      slotId: t.slotId || generateUniqueId(),
      time: t.time,
      status: t.status || "active",
      triggered: false,
      triggeredAt: null,
    })),
  }));
};

const getTodayDateStr = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const buildSlotDateTime = (dateStr, timeStr) => {
  const [h, min] = timeStr.split(":").map(Number);
  const [y, mo, d] = dateStr.split("-").map(Number);
  return new Date(y, mo - 1, d, h, min || 0, 0, 0);
};

const findDueSlots = (alarm, now = new Date()) => {
  const due = [];
  const today = getTodayDateStr();

  for (const schedule of alarm.schedules || []) {
    if (schedule.status !== "active") continue;
    if (schedule.date !== today) continue;

    for (let ti = 0; ti < (schedule.times || []).length; ti++) {
      const slot = schedule.times[ti];
      if (slot.status !== "active" || slot.triggered) continue;

      const slotAt = buildSlotDateTime(schedule.date, slot.time);
      if (slotAt <= now) {
        due.push({ scheduleDate: schedule.date, slotId: slot.slotId, timeIndex: ti });
      }
    }
  }

  return due;
};

const allSlotsTriggered = (alarm) => {
  const slots = (alarm.schedules || []).flatMap((s) => s.times || []);
  if (!slots.length) return true;
  return slots.every((t) => t.triggered || t.status === "inactive");
};

module.exports = {
  normalizeSchedules,
  getTodayDateStr,
  buildSlotDateTime,
  findDueSlots,
  allSlotsTriggered,
};
