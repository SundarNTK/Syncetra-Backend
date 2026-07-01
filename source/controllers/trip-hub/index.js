const mongoose = require("mongoose");
const db = require("../../utilities/constants/db-name");
const responseHandler = require("../../utilities/handlers/response-handler");
const exceptionHandler = require("../../utilities/handlers/exception-handler");
const { find, count } = require("../../utilities/helpers/mongo-query");
const { assertTripAccess } = require("../trips");

const buildExpenseSummary = (expenses, trip, collectedAmount, sponsorAmount) => {
  const totalSpent = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const plannedBudget = trip.budget || 0;
  const collected = collectedAmount ?? 0;
  const sponsorTotal = sponsorAmount ?? 0;
  const memberCount = Math.max((trip.members || []).length, 1);

  // Real money only — trip.budget is a planning estimate, never a spending ceiling.
  const shareCollectionSpent = expenses
    .filter((e) => (e.fundSource || "shareCollection") === "shareCollection")
    .reduce((sum, e) => sum + (e.amount || 0), 0);
  const sponsorSpent = expenses
    .filter((e) => e.fundSource === "sponsor")
    .reduce((sum, e) => sum + (e.amount || 0), 0);
  const shareCollectionRemaining = collected - shareCollectionSpent;
  const sponsorRemaining = sponsorTotal - sponsorSpent;

  const byCategory = expenses.reduce((acc, e) => {
    const cat = e.category || "Other";
    acc[cat] = (acc[cat] || 0) + (e.amount || 0);
    return acc;
  }, {});

  const categoryChart = Object.entries(byCategory).map(([name, value]) => ({
    name,
    value,
  }));

  const highestCategory = categoryChart.sort((a, b) => b.value - a.value)[0]?.name || "—";
  const pendingPayments = expenses.filter((e) => e.paymentStatus === "pending").length;

  return {
    plannedBudget,
    totalCollected: collected,
    totalSponsor: sponsorTotal,
    totalSpent,
    shareCollectionSpent,
    shareCollectionRemaining,
    sponsorSpent,
    sponsorRemaining,
    memberCount,
    perMemberShare: totalSpent / memberCount,
    categoryChart,
    insights: {
      highestCategory,
      pendingPayments,
    },
  };
};

const getTripHub = async (req, res) => {
  try {
    const trip = await assertTripAccess(req.params.tripId, req.user.userId, true);
    const tripId = new mongoose.Types.ObjectId(req.params.tripId);

    const [expenses, tasks, vehicles, attendance, mediaCount, polls, checklists, shareCollections, sponsors] =
      await Promise.all([
        find(db.expenses, { tripId, isDeleted: false }),
        find(db.tasks, { tripId, isDeleted: false }),
        find(db.vehicles, { tripId, isDeleted: false }),
        find(db.attendance, { tripId, isDeleted: false }),
        count(db.media, { tripId, isDeleted: false }),
        find(db.polls, { tripId, isDeleted: false }),
        find(db.checklists, { tripId, isDeleted: false }),
        find(db.shareCollection, { tripId, isDeleted: false }),
        find(db.sponsors, { tripId, isDeleted: false }),
      ]);

    const totalCollected = shareCollections.reduce((sum, s) => sum + (s.paidAmount || 0), 0);
    const totalSponsor = sponsors.reduce((sum, s) => sum + (s.amount || 0), 0);
    const expenseSummary = buildExpenseSummary(expenses, trip, totalCollected, totalSponsor);

    return responseHandler({
      res,
      response: {
        trip,
        expenseSummary,
        counts: {
          tasks: tasks.length,
          tasksCompleted: tasks.filter((t) => t.status === "completed").length,
          vehicles: vehicles.length,
          attendance: attendance.length,
          media: mediaCount,
          polls: polls.length,
          checklist: checklists.length,
          checklistPacked: checklists.filter((c) => (c.packedBy || []).length > 0).length,
        },
      },
    });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const getTripReport = async (req, res) => {
  try {
    const trip = await assertTripAccess(req.params.tripId, req.user.userId, true);
    const tripId = new mongoose.Types.ObjectId(req.params.tripId);
    const [expenses, shareCollections, sponsors] = await Promise.all([
      find(db.expenses, { tripId, isDeleted: false }),
      find(db.shareCollection, { tripId, isDeleted: false }),
      find(db.sponsors, { tripId, isDeleted: false }),
    ]);
    const totalCollected = shareCollections.reduce((sum, s) => sum + (s.paidAmount || 0), 0);
    const totalSponsor = sponsors.reduce((sum, s) => sum + (s.amount || 0), 0);
    return responseHandler({
      res,
      response: {
        trip,
        expenseSummary: buildExpenseSummary(expenses, trip, totalCollected, totalSponsor),
        expenses,
      },
    });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

module.exports = { getTripHub, getTripReport, buildExpenseSummary };
