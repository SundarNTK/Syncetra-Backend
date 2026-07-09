const mongoose = require("mongoose");
const db = require("../../utilities/constants/db-name");
const messages = require("../../utilities/constants/messages");
const responseHandler = require("../../utilities/handlers/response-handler");
const exceptionHandler = require("../../utilities/handlers/exception-handler");
const {
  find,
  findOne,
  insertNewDocument,
  updateDocument,
} = require("../../utilities/helpers/mongo-query");

const parseLocationFields = (body) => {
  const out = {};
  if (body.locationName !== undefined) out.locationName = body.locationName || "";
  if (body.mapLink !== undefined) out.mapLink = body.mapLink || "";
  if (body.latitude !== undefined) {
    out.latitude =
      body.latitude != null && body.latitude !== "" ? Number(body.latitude) : null;
  }
  if (body.longitude !== undefined) {
    out.longitude =
      body.longitude != null && body.longitude !== "" ? Number(body.longitude) : null;
  }
  return out;
};

const TRIP_UPDATE_FIELDS = [
  "tripName",
  "description",
  "startDate",
  "endDate",
  "budget",
  "collectedAmount",
  "coverImage",
  "tripType",
  "status",
  "locationName",
  "latitude",
  "longitude",
  "mapLink",
  "isEpassTaken",
  "epassDocuments",
];

const pickTripUpdate = (body) => {
  const update = {};
  for (const key of TRIP_UPDATE_FIELDS) {
    if (body[key] !== undefined) update[key] = body[key];
  }
  if (update.budget !== undefined) update.budget = Number(update.budget) || 0;
  if (update.collectedAmount !== undefined) {
    update.collectedAmount = Number(update.collectedAmount) || 0;
  }
  if (update.isEpassTaken !== undefined) {
    update.isEpassTaken = Boolean(update.isEpassTaken);
    if (!update.isEpassTaken) update.epassDocuments = [];
  }
  if (update.epassDocuments !== undefined) {
    update.epassDocuments = Array.isArray(update.epassDocuments) ? update.epassDocuments : [];
  }
  return { ...update, ...parseLocationFields(body) };
};

const assertTripAccess = async (tripId, userId, isAdmin = true) => {
  const baseQuery = { _id: tripId, isDeleted: false };
  if (isAdmin) {
    const trip = await findOne(db.trips, baseQuery);
    if (!trip) throw messages.NOT_FOUND;
    return trip;
  }

  const uid = new mongoose.Types.ObjectId(userId);
  let trip = await findOne(db.trips, {
    ...baseQuery,
    $or: [{ createdBy: uid }, { members: uid }],
  });
  if (trip) return trip;

  const inGroup = await findOne(db.groups, {
    tripId: new mongoose.Types.ObjectId(tripId),
    members: uid,
    isDeleted: false,
  });
  if (!inGroup) throw messages.NOT_FOUND;

  trip = await findOne(db.trips, baseQuery);
  if (!trip) throw messages.NOT_FOUND;
  return trip;
};

const createTrip = async (req, res) => {
  try {
    const {
      tripName,
      description,
      startDate,
      endDate,
      budget,
      collectedAmount,
      members,
      coverImage,
      tripType,
      status,
      isEpassTaken,
      epassDocuments,
    } = req.body;
    if (!tripName) throw "Trip name is required";

    const memberIds = (members || []).map((id) => new mongoose.Types.ObjectId(id));
    const trip = await insertNewDocument(db.trips, {
      tripName,
      description,
      startDate,
      endDate,
      budget: Number(budget) || 0,
      collectedAmount: Number(collectedAmount) || 0,
      members: memberIds,
      createdBy: req.user.userId,
      coverImage: coverImage || "",
      tripType: tripType || "group",
      status: status || "planned",
      isEpassTaken: Boolean(isEpassTaken),
      epassDocuments: isEpassTaken && Array.isArray(epassDocuments) ? epassDocuments : [],
      ...parseLocationFields(req.body),
    });

    return responseHandler({ res, message: messages.CREATED, response: trip });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const listTrips = async (req, res) => {
  try {
    const trips = await find(db.trips, { isDeleted: false });
    return responseHandler({ res, response: trips, recordsCount: trips.length });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const getTrip = async (req, res) => {
  try {
    const trip = await assertTripAccess(req.params.id, req.user.userId, true);
    return responseHandler({ res, response: trip });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const updateTrip = async (req, res) => {
  try {
    await assertTripAccess(req.params.id, req.user.userId, true);
    const update = pickTripUpdate(req.body);
    if (req.body.members) {
      update.members = req.body.members.map((id) => new mongoose.Types.ObjectId(id));
    }
    const trip = await updateDocument(
      db.trips,
      { _id: req.params.id, isDeleted: false },
      update
    );
    return responseHandler({ res, message: messages.UPDATED, response: trip });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const deleteTrip = async (req, res) => {
  try {
    await assertTripAccess(req.params.id, req.user.userId, true);
    await updateDocument(db.trips, { _id: req.params.id }, { isDeleted: true });
    return responseHandler({ res, message: messages.DELETED });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const listUserTrips = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const userGroups = await find(db.groups, { members: userId, isDeleted: false });
    const tripIdsFromGroups = [
      ...new Set(
        userGroups.map((g) => (g.tripId ? String(g.tripId) : null)).filter(Boolean)
      ),
    ].map((id) => new mongoose.Types.ObjectId(id));

    const orClause = [{ createdBy: userId }, { members: userId }];
    if (tripIdsFromGroups.length) orClause.push({ _id: { $in: tripIdsFromGroups } });

    const trips = await find(db.trips, { isDeleted: false, $or: orClause });
    return responseHandler({ res, response: trips, recordsCount: trips.length });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

module.exports = {
  createTrip,
  listTrips,
  getTrip,
  updateTrip,
  deleteTrip,
  listUserTrips,
  assertTripAccess,
};
