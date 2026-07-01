const express = require("express");
const router = express.Router();
const {
  createTrip,
  listTrips,
  getTrip,
  updateTrip,
  deleteTrip,
} = require("../../../controllers/trips");
const { getTripHub, getTripReport } = require("../../../controllers/trip-hub");
const m = require("../../../controllers/trip-modules");
const superAdminOnly = require("../../../middleware/super-admin-only");

router.get("/trips", listTrips);
router.post("/trips", superAdminOnly, createTrip);
router.get("/trips/:id", getTrip);
router.put("/trips/:id", superAdminOnly, updateTrip);
router.delete("/trips/:id", superAdminOnly, deleteTrip);

router.get("/trips/:tripId/hub", getTripHub);
router.get("/trips/:tripId/report", getTripReport);
router.put("/trips/:tripId/budget", m.updateTripBudget);

router.get("/trips/:tripId/expenses", m.listExpenses);
router.post("/trips/:tripId/expenses", m.addExpense);
router.put("/trips/:tripId/expenses/:id", m.updateExpense);
router.delete("/trips/:tripId/expenses/:id", superAdminOnly, m.deleteExpense);

router.get("/trips/:tripId/tasks", m.listTasks);
router.post("/trips/:tripId/tasks", m.addTask);
router.put("/trips/:tripId/tasks/:id", m.updateTask);
router.delete("/trips/:tripId/tasks/:id", m.deleteTask);

router.get("/trips/:tripId/vehicles", m.listVehicles);
router.post("/trips/:tripId/vehicles", m.addVehicle);
router.put("/trips/:tripId/vehicles/:id", m.updateVehicle);
router.delete("/trips/:tripId/vehicles/:id", m.deleteVehicle);

router.get("/trips/:tripId/hotels", m.listHotels);
router.post("/trips/:tripId/hotels", m.addHotel);
router.put("/trips/:tripId/hotels/:id", m.updateHotel);
router.delete("/trips/:tripId/hotels/:id", m.deleteHotel);

router.post("/maps/resolve-link", m.resolveMapLink);

router.get("/trips/:tripId/attendance/checkpoints", m.listAttendanceCheckpoints);
router.get("/trips/:tripId/attendance", m.listAttendance);
router.post("/trips/:tripId/attendance", m.upsertAttendance);
router.put("/trips/:tripId/attendance/:recordId", m.updateAttendanceRecord);

router.post("/trips/:tripId/media/sign", m.signUpload);
router.get("/trips/:tripId/media", m.listMedia);
router.post("/trips/:tripId/media", m.addMedia);
router.get("/trips/:tripId/media/:id", m.getMediaItem);
router.delete("/trips/:tripId/media/:id", m.deleteMedia);

router.get("/trips/:tripId/polls", m.listPolls);
router.post("/trips/:tripId/polls", m.addPoll);
router.post("/trips/:tripId/polls/:id/vote", m.votePoll);

router.get("/trips/:tripId/members", m.listTripMembers);
router.get("/trips/:tripId/checklists", m.listChecklists);
router.get("/trips/:tripId/checklists/:id", m.getChecklistItem);
router.post("/trips/:tripId/checklists", m.addChecklist);
router.put("/trips/:tripId/checklists/:id", superAdminOnly, m.updateChecklist);
router.delete("/trips/:tripId/checklists/:id", superAdminOnly, m.deleteChecklist);
router.put("/trips/:tripId/checklists/:id/toggle", m.toggleChecklistItem);

router.get("/trips/:tripId/schedules", m.listSchedules);
router.post("/trips/:tripId/schedules", m.addSchedule);

router.get("/trips/:tripId/sync", m.listSyncStatus);

router.get("/trips/:tripId/itinerary", m.listItinerary);
router.post("/trips/:tripId/itinerary", m.addItinerary);
router.put("/trips/:tripId/itinerary/reorder", m.reorderItinerary);
router.put("/trips/:tripId/itinerary/:id", m.updateItinerary);
router.delete("/trips/:tripId/itinerary/:id", m.deleteItinerary);

router.get("/trips/:tripId/share-collections", m.listShareCollections);
router.post("/trips/:tripId/share-collections", m.addShareCollection);
router.put("/trips/:tripId/share-collections/:id", m.updateShareCollection);
router.delete("/trips/:tripId/share-collections/:id", m.deleteShareCollection);
router.post("/trips/:tripId/share-collections/:id/payments", m.addPaymentTransaction);
router.put("/trips/:tripId/share-collections/:id/payments/:paymentId", superAdminOnly, m.updatePaymentTransaction);
router.delete("/trips/:tripId/share-collections/:id/payments/:paymentId", m.deletePaymentTransaction);

router.get("/trips/:tripId/sponsors", m.listSponsors);
router.post("/trips/:tripId/sponsors", m.addSponsor);
router.put("/trips/:tripId/sponsors/:id", m.updateSponsor);
router.delete("/trips/:tripId/sponsors/:id", superAdminOnly, m.deleteSponsor);

module.exports = router;
