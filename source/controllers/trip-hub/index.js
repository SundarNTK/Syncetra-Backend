const mongoose = require("mongoose");
const db = require("../../utilities/constants/db-name");
const responseHandler = require("../../utilities/handlers/response-handler");
const exceptionHandler = require("../../utilities/handlers/exception-handler");
const { find, count } = require("../../utilities/helpers/mongo-query");
const { assertTripAccess } = require("../trips");

const buildExpenseSummary = (expenses, trip) => {
  const totalSpent = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const budget = trip.budget || 0;
  const collected = trip.collectedAmount || 0;
  const memberCount = Math.max((trip.members || []).length, 1);
  const remaining = budget - totalSpent;

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
    totalBudget: budget,
    totalCollected: collected,
    totalSpent,
    remainingBalance: remaining,
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

    const [expenses, tasks, vehicles, attendance, mediaCount, polls, checklists] =
      await Promise.all([
        find(db.expenses, { tripId, isDeleted: false }),
        find(db.tasks, { tripId, isDeleted: false }),
        find(db.vehicles, { tripId, isDeleted: false }),
        find(db.attendance, { tripId, isDeleted: false }),
        count(db.media, { tripId, isDeleted: false }),
        find(db.polls, { tripId, isDeleted: false }),
        find(db.checklists, { tripId, isDeleted: false }),
      ]);

    const expenseSummary = buildExpenseSummary(expenses, trip);

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
    const expenses = await find(db.expenses, {
      tripId: req.params.tripId,
      isDeleted: false,
    });
    return responseHandler({
      res,
      response: {
        trip,
        expenseSummary: buildExpenseSummary(expenses, trip),
        expenses,
      },
    });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

module.exports = { getTripHub, getTripReport, buildExpenseSummary };
