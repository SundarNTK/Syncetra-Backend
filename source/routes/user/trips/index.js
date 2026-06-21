const express = require("express");
const router = express.Router();
const { listUserTrips } = require("../../../controllers/trips");
const m = require("../../../controllers/trip-modules");

router.get("/trips", listUserTrips);

router.get("/trips/:tripId/expenses", m.userListExpenses);
router.get("/tasks/pending", m.userPendingTasks);
router.get("/trips/:tripId/tasks", m.userListTasks);
router.post("/trips/:tripId/tasks/:id/acknowledge", m.acknowledgeTask);
router.get("/trips/:tripId/vehicles", m.userListVehicles);
router.get("/trips/:tripId/attendance", m.userListAttendance);
router.post("/trips/:tripId/attendance", m.upsertAttendance);
router.get("/trips/:tripId/media", m.listMedia);
router.post("/trips/:tripId/media", m.addMedia);
router.get("/trips/:tripId/media/:id", m.getMediaItem);
router.get("/trips/:tripId/polls", m.listPolls);
router.post("/trips/:tripId/polls/:id/vote", m.votePoll);
router.get("/trips/:tripId/checklists", m.listChecklists);
router.get("/trips/:tripId/checklists/:id", m.getChecklistItem);
router.put("/trips/:tripId/checklists/:id/toggle", m.toggleChecklistItem);
router.get("/trips/:tripId/schedules", m.listSchedules);
router.get("/trips/:tripId/members", m.listTripMembers);
router.get("/trips/:tripId/itinerary", m.listItinerary);
router.get("/trips/:tripId/share-collection/me", m.getUserShareCollection);
router.get("/trips/:tripId/sponsors", m.userListSponsors);

module.exports = router;
