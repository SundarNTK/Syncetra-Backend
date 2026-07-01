const db = require("../utilities/constants/db-name");

const models = {};
models[db.users] = require("./users");
models[db.groups] = require("./groups");
models[db.alarms] = require("./alarms");
models[db.alarmLogs] = require("./alarm-logs");
models[db.otps] = require("./otps");
models[db.trips] = require("./trips");
models[db.expenses] = require("./trip-expenses");
models[db.tasks] = require("./trip-tasks");
models[db.vehicles] = require("./trip-vehicles");
models[db.attendance] = require("./trip-attendance");
models[db.media] = require("./trip-media");
models[db.polls] = require("./trip-polls");
models[db.checklists] = require("./trip-checklists");
models[db.schedules] = require("./trip-schedules");
models[db.memberSync] = require("./trip-member-sync");
models[db.appPolls] = require("./app-polls");
models[db.itinerary] = require("./trip-itinerary");
models[db.shareCollection] = require("./trip-share-collection");
models[db.sponsors] = require("./trip-sponsors");
models[db.hotels] = require("./trip-hotels");

module.exports = models;
