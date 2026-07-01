const mongoose = require("mongoose");
const db = require("../../utilities/constants/db-name");
const Env = require("../../configurations/environment");
const cloudinary = require("../../configurations/cloudinary");
const Models = require("../../models");
const messages = require("../../utilities/constants/messages");
const responseHandler = require("../../utilities/handlers/response-handler");
const exceptionHandler = require("../../utilities/handlers/exception-handler");
const {
  find,
  findWithProjection,
  findOne,
  insertNewDocument,
  updateDocument,
} = require("../../utilities/helpers/mongo-query");
const { assertTripAccess } = require("../trips");
const { resolveGoogleMapsLink } = require("../../utilities/helpers/google-maps-link");

const tripIdParam = (req) => req.params.tripId;

const tripObjectId = (req) => new mongoose.Types.ObjectId(tripIdParam(req));

const isPrivilegedUser = (req) =>
  req.user?.role === Env.ROLES.ADMIN || req.user?.role === Env.ROLES.SUPER_ADMIN;

const assertAdminTrip = async (req) =>
  assertTripAccess(tripIdParam(req), req.user.userId, true);

const assertMemberTrip = async (req) =>
  assertTripAccess(tripIdParam(req), req.user.userId, false);

/** Admins can manage any trip; members only trips they belong to. */
const assertChecklistTrip = async (req) =>
  isPrivilegedUser(req) ? assertAdminTrip(req) : assertMemberTrip(req);

/** Max stored image (base64/data URL). Matches frontend upload cap. */
const CHECKLIST_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
/** Inline image in list responses — large payloads break JSON/list requests. */
const CHECKLIST_IMAGE_LIST_INLINE_MAX = 200 * 1024;

const checklistAssignedUserIds = (assignedTo) => {
  if (assignedTo == null) return [];
  if (Array.isArray(assignedTo)) {
    return assignedTo
      .map((a) => {
        if (a == null) return "";
        if (typeof a === "object" && a._id != null) return String(a._id);
        return String(a);
      })
      .filter(Boolean);
  }
  if (typeof assignedTo === "object" && assignedTo._id != null) return [String(assignedTo._id)];
  const single = String(assignedTo);
  return single && single !== "null" ? [single] : [];
};

const memberSeesChecklist = (row, uid) => {
  const assigneeIds = checklistAssignedUserIds(row.assignedTo);
  if (!assigneeIds.length) return true;
  return assigneeIds.includes(uid);
};

const collectTripMemberIdStrings = async (trip) => {
  const memberIdSet = new Set((trip.members || []).map((m) => String(m)));
  const groups = await find(db.groups, {
    tripId: new mongoose.Types.ObjectId(trip._id),
    isDeleted: false,
  });
  for (const g of groups) {
    for (const m of g.members || []) memberIdSet.add(String(m));
  }
  return [...memberIdSet];
};

const parseChecklistAssignees = (body, allowedMemberIds) => {
  let raw = body.assignedTo;
  if (raw == null || raw === "") return [];
  if (!Array.isArray(raw)) raw = [raw];
  const ids = [...new Set(raw.map((x) => String(x).trim()).filter(Boolean))];
  if (!ids.length) return [];
  const allowed = new Set(allowedMemberIds);
  for (const id of ids) {
    if (!allowed.has(id)) throw "Each assignee must be a member of this trip";
  }
  return ids.map((id) => new mongoose.Types.ObjectId(id));
};

const serializeChecklistForList = (row, { includeFullImage = false } = {}) => {
  const url = row.imageUrl != null ? String(row.imageUrl) : "";
  const hasImage = url.length > 0;
  const imageUrl =
    hasImage && (includeFullImage || url.length <= CHECKLIST_IMAGE_LIST_INLINE_MAX) ? url : "";
  return { ...row, hasImage, imageUrl };
};

const listExpenses = async (req, res) => {
  try {
    await assertAdminTrip(req);
    const items = await find(db.expenses, { tripId: tripIdParam(req), isDeleted: false });
    return responseHandler({ res, response: items });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const addExpense = async (req, res) => {
  try {
    await assertAdminTrip(req);
    const item = await insertNewDocument(db.expenses, {
      ...req.body,
      tripId: tripIdParam(req),
      amount: Number(req.body.amount),
      createdBy: req.user.userId,
    });
    return responseHandler({ res, message: messages.CREATED, response: item });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const updateExpense = async (req, res) => {
  try {
    await assertAdminTrip(req);
    const item = await findOne(db.expenses, {
      _id: req.params.id,
      tripId: tripIdParam(req),
      isDeleted: false,
    });
    if (!item) throw messages.NOT_FOUND;
    const updated = await updateDocument(db.expenses, { _id: item._id }, {
      ...req.body,
      amount: req.body.amount !== undefined ? Number(req.body.amount) : item.amount,
    });
    return responseHandler({ res, message: messages.UPDATED, response: updated });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const deleteExpense = async (req, res) => {
  try {
    await assertAdminTrip(req);
    const item = await updateDocument(
      db.expenses,
      { _id: req.params.id, tripId: tripIdParam(req), isDeleted: false },
      { isDeleted: true }
    );
    if (!item) throw messages.NOT_FOUND;
    return responseHandler({ res, message: messages.DELETED });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const updateTripBudget = async (req, res) => {
  try {
    await assertAdminTrip(req);
    const trip = await updateDocument(
      db.trips,
      { _id: tripIdParam(req) },
      {
        budget: Number(req.body.budget) || 0,
        collectedAmount: Number(req.body.collectedAmount) || 0,
      }
    );
    return responseHandler({ res, message: messages.UPDATED, response: trip });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const { emitToUser } = require("../../configurations/socket");

const populateTask = (query) =>
  query
    .populate("assignedTo", "name email mobileNumber")
    .populate({ path: "acknowledgments.userId", select: "name email" })
    .populate("createdBy", "name email");

const listTasks = async (req, res) => {
  try {
    await assertAdminTrip(req);
    const tasks = await populateTask(
      Models[db.tasks].find({ tripId: tripIdParam(req), isDeleted: false }).sort({ createdAt: -1 })
    ).lean();
    return responseHandler({ res, response: tasks });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const addTask = async (req, res) => {
  try {
    await assertAdminTrip(req);
    const { title, description, assignedTo: rawAssignedTo, status } = req.body;
    if (!title?.trim()) throw "Task title is required";
    const rawIds = Array.isArray(rawAssignedTo)
      ? rawAssignedTo
      : rawAssignedTo ? [rawAssignedTo] : [];
    const assignedTo = rawIds.map((id) => new mongoose.Types.ObjectId(id));
    const acknowledgments = assignedTo.map((userId) => ({
      userId,
      status: "pending",
      comment: "",
      acceptedAt: null,
    }));
    const created = await insertNewDocument(db.tasks, {
      tripId: tripIdParam(req),
      title: title.trim(),
      description: (description || "").trim(),
      assignedTo,
      acknowledgments,
      status: status || "pending",
      createdBy: req.user.userId,
    });
    const populated = await populateTask(Models[db.tasks].findById(created._id)).lean();
    for (const uid of assignedTo) {
      emitToUser(String(uid), "task:assigned", { task: populated });
    }
    return responseHandler({ res, message: messages.CREATED, response: populated });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const updateTask = async (req, res) => {
  try {
    await assertAdminTrip(req);
    const isSuperAdmin = req.user?.role === Env.ROLES.SUPER_ADMIN;
    if (!isSuperAdmin) throw "Only Super Admins can edit tasks.";

    const task = await Models[db.tasks].findOne({
      _id: req.params.id,
      tripId: tripIdParam(req),
      isDeleted: false,
    });
    if (!task) throw "Task not found";

    const { title, description, status, assignedTo: rawAssignedTo } = req.body;
    const update = {};
    if (title !== undefined) update.title = String(title).trim();
    if (description !== undefined) update.description = String(description).trim();
    if (status !== undefined) update.status = status;

    let newlyAssigned = [];
    if (rawAssignedTo !== undefined) {
      const rawIds = Array.isArray(rawAssignedTo)
        ? rawAssignedTo
        : rawAssignedTo ? [rawAssignedTo] : [];
      const assignedTo = rawIds.map((id) => new mongoose.Types.ObjectId(id));
      update.assignedTo = assignedTo;

      const existingAckMap = new Map(
        (task.acknowledgments || []).map((a) => [String(a.userId), a])
      );
      const oldIds = new Set((task.assignedTo || []).map(String));
      update.acknowledgments = assignedTo.map((userId) => {
        const uid = String(userId);
        const existing = existingAckMap.get(uid);
        if (existing) {
          return {
            userId,
            status: existing.status || "pending",
            comment: existing.comment || "",
            acceptedAt: existing.acceptedAt || null,
            respondedAt: existing.respondedAt || null,
          };
        }
        return {
          userId,
          status: "pending",
          comment: "",
          acceptedAt: null,
          respondedAt: null,
        };
      });
      newlyAssigned = assignedTo.filter((id) => !oldIds.has(String(id)));
    }

    if (!Object.keys(update).length) throw "No valid fields to update";
    await updateDocument(
      db.tasks,
      { _id: req.params.id, tripId: tripIdParam(req), isDeleted: false },
      update
    );
    const populated = await populateTask(Models[db.tasks].findById(req.params.id)).lean();
    for (const uid of newlyAssigned) {
      emitToUser(String(uid), "task:assigned", { task: populated });
    }
    return responseHandler({ res, message: messages.UPDATED, response: populated });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const deleteTask = async (req, res) => {
  try {
    await assertAdminTrip(req);
    const task = await updateDocument(
      db.tasks,
      { _id: req.params.id, tripId: tripIdParam(req), isDeleted: false },
      { isDeleted: true }
    );
    if (!task) throw "Task not found";
    return responseHandler({ res, message: messages.DELETED });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const acknowledgeTask = async (req, res) => {
  try {
    const { comment, action } = req.body;
    if (!comment?.trim()) throw "A comment is required";
    const ackStatus = action === "refused" ? "refused" : "accepted";

    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const task = await Models[db.tasks].findOne({
      _id: req.params.id,
      tripId: tripIdParam(req),
      isDeleted: false,
      assignedTo: userId,
    });
    if (!task) throw "Task not found or not assigned to you";
    const ack = task.acknowledgments.find((a) => String(a.userId) === String(userId));
    if (!ack) throw "Acknowledgment record not found";
    if (ack.status !== "pending") throw "Task has already been responded to";

    ack.status      = ackStatus;
    ack.comment     = comment.trim();
    ack.respondedAt = new Date();
    if (ackStatus === "accepted") ack.acceptedAt = ack.respondedAt;
    await task.save();

    // Notify admin in real-time
    const populated = await populateTask(Models[db.tasks].findById(task._id)).lean();
    if (task.createdBy) {
      emitToUser(String(task.createdBy), "task:acknowledged", { task: populated });
    }

    return responseHandler({
      res,
      message: ackStatus === "accepted" ? "Task accepted successfully" : "Task refused",
      response: populated,
    });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const listVehicles = async (req, res) => {
  try {
    await assertAdminTrip(req);
    const items = await find(db.vehicles, { tripId: tripIdParam(req), isDeleted: false });
    return responseHandler({ res, response: items });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const addVehicle = async (req, res) => {
  try {
    await assertAdminTrip(req);
    const item = await insertNewDocument(db.vehicles, {
      ...req.body,
      tripId: tripIdParam(req),
      totalSeats: Number(req.body.totalSeats) || 4,
      advanceAmount: Number(req.body.advanceAmount) || 0,
      totalAmount: Number(req.body.totalAmount) || 0,
      images: Array.isArray(req.body.images) ? req.body.images : [],
    });
    return responseHandler({ res, message: messages.CREATED, response: item });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const updateVehicle = async (req, res) => {
  try {
    await assertAdminTrip(req);
    const item = await findOne(db.vehicles, {
      _id: req.params.id,
      tripId: tripIdParam(req),
      isDeleted: false,
    });
    if (!item) throw messages.NOT_FOUND;
    const updated = await updateDocument(db.vehicles, { _id: item._id }, {
      ...req.body,
      totalSeats: req.body.totalSeats ? Number(req.body.totalSeats) : item.totalSeats,
      advanceAmount: req.body.advanceAmount !== undefined ? Number(req.body.advanceAmount) : item.advanceAmount,
      totalAmount: req.body.totalAmount !== undefined ? Number(req.body.totalAmount) : item.totalAmount,
      images: Array.isArray(req.body.images) ? req.body.images : item.images,
    });
    return responseHandler({ res, message: messages.UPDATED, response: updated });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const deleteVehicle = async (req, res) => {
  try {
    await assertAdminTrip(req);
    const existing = await findOne(db.vehicles, {
      _id: req.params.id,
      tripId: tripIdParam(req),
      isDeleted: false,
    });
    if (!existing) throw messages.NOT_FOUND;
    await updateDocument(db.vehicles, { _id: existing._id }, { isDeleted: true });
    return responseHandler({ res, message: messages.DELETED });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const userListVehicles = async (req, res) => {
  try {
    await assertMemberTrip(req);
    const items = await find(db.vehicles, { tripId: tripIdParam(req), isDeleted: false });
    return responseHandler({ res, response: items });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

/** Cap media arrays at 10 items each — backend safety net behind the frontend cap. */
const capMedia = (arr) => (Array.isArray(arr) ? arr.slice(0, 10) : []);

const listHotels = async (req, res) => {
  try {
    await assertAdminTrip(req);
    const items = await find(db.hotels, { tripId: tripIdParam(req), isDeleted: false });
    return responseHandler({ res, response: items });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const addHotel = async (req, res) => {
  try {
    await assertAdminTrip(req);
    const item = await insertNewDocument(db.hotels, {
      ...req.body,
      tripId: tripIdParam(req),
      createdBy: req.user.userId,
      perDayCost: Number(req.body.perDayCost) || 0,
      advanceAmount: Number(req.body.advanceAmount) || 0,
      advancePaid: Boolean(req.body.advancePaid),
      paymentCompleted: Boolean(req.body.paymentCompleted),
      roomsCount: Number(req.body.roomsCount) || 1,
      bedsCount: Number(req.body.bedsCount) || 1,
      images: capMedia(req.body.images),
      videos: capMedia(req.body.videos),
      complimentary: Array.isArray(req.body.complimentary) ? req.body.complimentary : [],
    });
    return responseHandler({ res, message: messages.CREATED, response: item });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const updateHotel = async (req, res) => {
  try {
    await assertAdminTrip(req);
    const item = await findOne(db.hotels, {
      _id: req.params.id,
      tripId: tripIdParam(req),
      isDeleted: false,
    });
    if (!item) throw messages.NOT_FOUND;
    const updated = await updateDocument(db.hotels, { _id: item._id }, {
      ...req.body,
      perDayCost: req.body.perDayCost !== undefined ? Number(req.body.perDayCost) : item.perDayCost,
      advanceAmount: req.body.advanceAmount !== undefined ? Number(req.body.advanceAmount) : item.advanceAmount,
      advancePaid: req.body.advancePaid !== undefined ? Boolean(req.body.advancePaid) : item.advancePaid,
      paymentCompleted: req.body.paymentCompleted !== undefined ? Boolean(req.body.paymentCompleted) : item.paymentCompleted,
      roomsCount: req.body.roomsCount !== undefined ? Number(req.body.roomsCount) : item.roomsCount,
      bedsCount: req.body.bedsCount !== undefined ? Number(req.body.bedsCount) : item.bedsCount,
      images: req.body.images !== undefined ? capMedia(req.body.images) : item.images,
      videos: req.body.videos !== undefined ? capMedia(req.body.videos) : item.videos,
      complimentary: Array.isArray(req.body.complimentary) ? req.body.complimentary : item.complimentary,
    });
    return responseHandler({ res, message: messages.UPDATED, response: updated });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const deleteHotel = async (req, res) => {
  try {
    await assertAdminTrip(req);
    const existing = await findOne(db.hotels, {
      _id: req.params.id,
      tripId: tripIdParam(req),
      isDeleted: false,
    });
    if (!existing) throw messages.NOT_FOUND;
    await updateDocument(db.hotels, { _id: existing._id }, { isDeleted: true });
    return responseHandler({ res, message: messages.DELETED });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const userListHotels = async (req, res) => {
  try {
    await assertMemberTrip(req);
    const items = await find(db.hotels, { tripId: tripIdParam(req), isDeleted: false });
    return responseHandler({ res, response: items });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const listAttendance = async (req, res) => {
  try {
    await assertAdminTrip(req);
    const filter = { tripId: tripIdParam(req), isDeleted: false };
    if (req.query.checkpoint) filter.checkpoint = req.query.checkpoint;
    const items = await find(db.attendance, filter);
    return responseHandler({ res, response: items });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const listAttendanceCheckpoints = async (req, res) => {
  try {
    await assertAdminTrip(req);
    const records = await find(db.attendance, { tripId: tripIdParam(req), isDeleted: false });
    const cpMap = {};
    records.forEach((r) => {
      const cp = r.checkpoint || "Trip Start";
      if (!cpMap[cp]) {
        cpMap[cp] = { checkpoint: cp, total: 0, present: 0, absent: 0, late: 0, markedAt: null };
      }
      cpMap[cp].total++;
      if (r.status === "present") cpMap[cp].present++;
      else if (r.status === "absent") cpMap[cp].absent++;
      else if (r.status === "late") cpMap[cp].late++;
      const t = r.markedAt || r.createdAt;
      if (!cpMap[cp].markedAt || new Date(t) < new Date(cpMap[cp].markedAt)) {
        cpMap[cp].markedAt = t;
      }
    });
    return responseHandler({ res, response: Object.values(cpMap) });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const updateAttendanceRecord = async (req, res) => {
  try {
    await assertAdminTrip(req);
    const item = await findOne(db.attendance, {
      _id: req.params.recordId,
      tripId: tripIdParam(req),
      isDeleted: false,
    });
    if (!item) throw messages.NOT_FOUND;
    const updated = await updateDocument(db.attendance, { _id: item._id }, {
      status: req.body.status || item.status,
      markedAt: new Date(),
      note: req.body.note !== undefined ? req.body.note : item.note,
    });
    return responseHandler({ res, message: messages.UPDATED, response: updated });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const userListAttendance = async (req, res) => {
  try {
    await assertMemberTrip(req);
    const items = await find(db.attendance, {
      tripId: tripIdParam(req),
      userId: req.user.userId,
      isDeleted: false,
    });
    return responseHandler({ res, response: items });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const upsertAttendance = async (req, res) => {
  try {
    const isAdmin = isPrivilegedUser(req);
    const trip = isAdmin ? await assertAdminTrip(req) : await assertMemberTrip(req);

    const userId = req.body.userId || req.user.userId;

    if (!isAdmin) {
      const isMember = (trip.members || []).some((m) => m.toString() === userId.toString());
      if (!isMember) throw messages.FORBIDDEN;
    }

    const checkpoint = req.body.checkpoint || "Trip Start";

    const existing = await findOne(db.attendance, {
      tripId: tripIdParam(req),
      userId,
      checkpoint,
      isDeleted: false,
    });

    if (existing) {
      const item = await updateDocument(db.attendance, { _id: existing._id }, {
        status: req.body.status || existing.status,
        checkpoint,
        markedAt: req.body.markedAt || new Date(),
        checkInAt: req.body.checkInAt || existing.checkInAt,
        checkOutAt: req.body.checkOutAt,
        note: req.body.note,
      });
      return responseHandler({ res, message: messages.UPDATED, response: item });
    }

    const item = await insertNewDocument(db.attendance, {
      tripId: tripIdParam(req),
      userId,
      status: req.body.status || "present",
      checkpoint,
      markedAt: req.body.markedAt || new Date(),
      checkInAt: req.body.checkInAt || new Date(),
      checkOutAt: req.body.checkOutAt,
      note: req.body.note,
    });
    return responseHandler({ res, message: messages.CREATED, response: item });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const signUpload = async (req, res) => {
  try {
    await assertChecklistTrip(req);
    const folder    = `syncetra/trips/${tripIdParam(req)}`;
    const timestamp = Math.round(Date.now() / 1000);
    const signature = cloudinary.utils.api_sign_request(
      { folder, timestamp },
      Env.CLOUDINARY_API_SECRET
    );
    return responseHandler({
      res,
      message: messages.SUCCESS || "OK",
      response: {
        timestamp,
        signature,
        api_key:    Env.CLOUDINARY_API_KEY,
        cloud_name: Env.CLOUDINARY_CLOUD_NAME,
        folder,
      },
    });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

/** Not trip-scoped — resolves a pasted Google Maps link (incl. shortened maps.app.goo.gl
 *  links) to lat/lng for the LocationPicker map, admin-only via the router's adminOnly guard. */
const resolveMapLink = async (req, res) => {
  try {
    const url = req.body?.url;
    if (!url) throw "A map link is required";
    const coords = await resolveGoogleMapsLink(url);
    if (!coords) {
      throw "Could not detect a location from that link — paste the full Google Maps link, or pin the location manually on the map";
    }
    return responseHandler({ res, response: coords });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const listMedia = async (req, res) => {
  try {
    await assertChecklistTrip(req);
    const filter = { tripId: tripIdParam(req), isDeleted: false };
    if (req.query.userId) filter.uploadedBy = req.query.userId;
    if (req.query.category) filter.category = req.query.category;
    const items = await find(db.media, filter);

    // Attach uploader display names
    const uploaderIds = [...new Set(items.map((m) => String(m.uploadedBy)).filter(Boolean))];
    let uploaderMap = {};
    if (uploaderIds.length) {
      const users = await findWithProjection(db.users, { _id: { $in: uploaderIds } }, { name: 1, username: 1 });
      users.forEach((u) => { uploaderMap[String(u._id)] = u.name || u.username || "Member"; });
    }
    const enriched = items.map((m) => ({ ...m, uploaderName: uploaderMap[String(m.uploadedBy)] || "Member" }));

    return responseHandler({ res, response: enriched });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const getMediaItem = async (req, res) => {
  try {
    await assertChecklistTrip(req);
    const item = await findOne(db.media, {
      _id: req.params.id,
      tripId: tripIdParam(req),
      isDeleted: false,
    });
    if (!item) throw messages.NOT_FOUND;
    return responseHandler({ res, response: item });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const addMedia = async (req, res) => {
  try {
    await assertChecklistTrip(req);
    const { url, mediaType, category, caption, fileName } = req.body;

    if (!url || typeof url !== "string") {
      return exceptionHandler({ res, error: "Media url is required" });
    }

    const isCloudinaryUrl = /^https:\/\/res\.cloudinary\.com\//i.test(url);
    const isHttpUrl       = /^https?:\/\//i.test(url);
    const isDataUrl       = url.startsWith("data:");
    if (!isCloudinaryUrl && !isHttpUrl && !isDataUrl) {
      return exceptionHandler({ res, error: "Use a valid Cloudinary or HTTP URL" });
    }

    const type = mediaType === "video" ? "video" : "image";
    const allowedCategories = ["food", "travel", "moments", "other"];
    const safeCategory = allowedCategories.includes(category) ? category : "moments";

    const item = await insertNewDocument(db.media, {
      tripId: tripIdParam(req),
      uploadedBy: req.user.userId,
      url,
      publicId:  req.body.publicId  || "",
      thumbUrl:  req.body.thumbUrl  || "",
      mediaType: type,
      category:  safeCategory,
      caption,
      fileName,
    });
    return responseHandler({ res, message: messages.CREATED, response: item });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const deleteMedia = async (req, res) => {
  try {
    await assertAdminTrip(req);
    const item = await findOne(db.media, {
      _id: req.params.id,
      tripId: tripIdParam(req),
      isDeleted: false,
    });
    if (!item) throw messages.NOT_FOUND;
    await updateDocument(db.media, { _id: item._id }, { isDeleted: true });
    if (item.publicId) {
      const resourceType = item.mediaType === "video" ? "video" : "image";
      cloudinary.uploader.destroy(item.publicId, { resource_type: resourceType }).catch(() => {});
    }
    return responseHandler({ res, message: messages.DELETED });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const deleteOwnMedia = async (req, res) => {
  try {
    await assertMemberTrip(req);
    const item = await findOne(db.media, {
      _id: req.params.id,
      tripId: tripIdParam(req),
      isDeleted: false,
    });
    if (!item) throw messages.NOT_FOUND;
    if (String(item.uploadedBy) !== String(req.user.userId)) {
      return exceptionHandler({ res, error: "You can only delete your own uploads" });
    }
    await updateDocument(db.media, { _id: item._id }, { isDeleted: true });
    if (item.publicId) {
      const resourceType = item.mediaType === "video" ? "video" : "image";
      cloudinary.uploader.destroy(item.publicId, { resource_type: resourceType }).catch(() => {});
    }
    return responseHandler({ res, message: messages.DELETED });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const listPolls = async (req, res) => {
  try {
    await assertMemberTrip(req);
    const items = await find(db.polls, { tripId: tripIdParam(req), isDeleted: false });
    return responseHandler({ res, response: items });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const addPoll = async (req, res) => {
  try {
    await assertAdminTrip(req);
    const options = (req.body.options || []).map((label) => ({ label, votes: [] }));
    const item = await insertNewDocument(db.polls, {
      tripId: tripIdParam(req),
      question: req.body.question,
      pollType: req.body.pollType || "general",
      options,
      createdBy: req.user.userId,
    });
    return responseHandler({ res, message: messages.CREATED, response: item });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const votePoll = async (req, res) => {
  try {
    await assertMemberTrip(req);
    const poll = await findOne(db.polls, {
      _id: req.params.id,
      tripId: tripIdParam(req),
      isDeleted: false,
    });
    if (!poll) throw messages.NOT_FOUND;
    const optionIndex = Number(req.body.optionIndex);
    if (optionIndex < 0 || optionIndex >= poll.options.length) throw "Invalid option";

    const doc = await Models[db.polls].findById(poll._id);
    doc.options[optionIndex].votes = doc.options[optionIndex].votes.filter(
      (v) => v.toString() !== req.user.userId
    );
    doc.options[optionIndex].votes.push(new mongoose.Types.ObjectId(req.user.userId));
    await doc.save();

    return responseHandler({ res, message: "Vote recorded", response: doc.toObject() });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const listTripMembers = async (req, res) => {
  try {
    await assertChecklistTrip(req);
    const trip = await assertTripAccess(
      tripIdParam(req),
      req.user.userId,
      isPrivilegedUser(req)
    );
    const memberIds = await collectTripMemberIdStrings(trip);
    if (!memberIds.length) {
      return responseHandler({ res, response: [], recordsCount: 0 });
    }
    const users = await find(db.users, {
      _id: { $in: memberIds.map((id) => new mongoose.Types.ObjectId(id)) },
      isDeleted: false,
    });
    const response = users
      .map((u) => ({
        id: u._id,
        name: u.name,
        email: u.email,
        mobileNumber: u.mobileNumber,
        profileImage: u.profileImage || null,
      }))
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    return responseHandler({ res, response, recordsCount: response.length });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const listChecklists = async (req, res) => {
  try {
    await assertChecklistTrip(req);
    const raw = await Models[db.checklists]
      .find({ tripId: tripIdParam(req), isDeleted: false })
      .populate("assignedTo", "name profileImage")
      .populate("packedBy", "name")
      .sort({ createdAt: 1 })
      .lean();

    const uid = String(req.user.userId);
    const visible = isPrivilegedUser(req) ? raw : raw.filter((row) => memberSeesChecklist(row, uid));
    const items = visible.map((row) => serializeChecklistForList(row));

    return responseHandler({ res, response: items });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const getChecklistItem = async (req, res) => {
  try {
    await assertChecklistTrip(req);
    const row = await Models[db.checklists]
      .findOne({ _id: req.params.id, tripId: tripIdParam(req), isDeleted: false })
      .populate("assignedTo", "name profileImage")
      .populate("packedBy", "name")
      .lean();
    if (!row) throw messages.NOT_FOUND;
    if (!isPrivilegedUser(req) && !memberSeesChecklist(row, String(req.user.userId))) {
      throw messages.NOT_FOUND;
    }
    return responseHandler({ res, response: serializeChecklistForList(row, { includeFullImage: true }) });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const addChecklist = async (req, res) => {
  try {
    await assertAdminTrip(req);
    const trip = await assertTripAccess(tripIdParam(req), req.user.userId, true);
    const allowedMemberIds = await collectTripMemberIdStrings(trip);
    const assignedTo = parseChecklistAssignees(req.body, allowedMemberIds);

    const imageUrl = String(req.body.imageUrl || "").trim();
    if (imageUrl.length > CHECKLIST_IMAGE_MAX_BYTES) {
      throw "Image must be under 2 MB";
    }

    const item = await insertNewDocument(db.checklists, {
      tripId: tripIdParam(req),
      item: String(req.body.item || "").trim(),
      description: String(req.body.description || "").trim(),
      imageUrl,
      assignedTo,
      isAdminItem: true,
    });
    const saved = item.toObject ? item.toObject() : item;
    return responseHandler({
      res,
      message: messages.CREATED,
      response: serializeChecklistForList(saved, { includeFullImage: true }),
    });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const updateChecklist = async (req, res) => {
  try {
    await assertAdminTrip(req);
    const trip = await assertTripAccess(tripIdParam(req), req.user.userId, true);
    const allowedMemberIds = await collectTripMemberIdStrings(trip);
    const existing = await findOne(db.checklists, {
      _id: req.params.id,
      tripId: tripIdParam(req),
      isDeleted: false,
    });
    if (!existing) throw messages.NOT_FOUND;

    const update = {};
    if (req.body.item !== undefined) {
      const name = String(req.body.item || "").trim();
      if (!name) throw "Item name is required";
      update.item = name;
    }
    if (req.body.description !== undefined) {
      update.description = String(req.body.description || "").trim();
    }
    if (req.body.assignedTo !== undefined) {
      update.assignedTo = parseChecklistAssignees(req.body, allowedMemberIds);
    }
    if (req.body.imageUrl !== undefined) {
      const imageUrl = String(req.body.imageUrl || "").trim();
      if (imageUrl.length > CHECKLIST_IMAGE_MAX_BYTES) {
        throw "Image must be under 2 MB";
      }
      update.imageUrl = imageUrl;
    }

    await updateDocument(db.checklists, { _id: existing._id }, update);
    const row = await Models[db.checklists]
      .findById(existing._id)
      .populate("assignedTo", "name profileImage email")
      .populate("packedBy", "name")
      .lean();

    return responseHandler({
      res,
      message: messages.UPDATED,
      response: serializeChecklistForList(row, { includeFullImage: true }),
    });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const deleteChecklist = async (req, res) => {
  try {
    await assertAdminTrip(req);
    const existing = await findOne(db.checklists, {
      _id: req.params.id,
      tripId: tripIdParam(req),
      isDeleted: false,
    });
    if (!existing) throw messages.NOT_FOUND;
    await updateDocument(db.checklists, { _id: existing._id }, { isDeleted: true });
    return responseHandler({ res, message: messages.DELETED });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const toggleChecklistItem = async (req, res) => {
  try {
    await assertMemberTrip(req);
    const userId = String(req.user.userId);

    const doc = await Models[db.checklists].findOne({
      _id: req.params.id,
      tripId: tripIdParam(req),
      isDeleted: false,
    });
    if (!doc) throw messages.NOT_FOUND;

    const assigneeIds = checklistAssignedUserIds(doc.assignedTo);
    if (assigneeIds.length > 0 && !assigneeIds.includes(userId)) {
      throw "This checklist item is assigned to another member";
    }

    const uid = new mongoose.Types.ObjectId(userId);
    const alreadyPacked = doc.packedBy.some((p) => p.toString() === userId);
    if (alreadyPacked) {
      doc.packedBy = doc.packedBy.filter((p) => p.toString() !== userId);
    } else {
      doc.packedBy.push(uid);
    }
    await doc.save();

    return responseHandler({
      res,
      message: messages.UPDATED,
      response: {
        _id: doc._id,
        packedBy: doc.packedBy.map((p) => p.toString()),
      },
    });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const listSchedules = async (req, res) => {
  try {
    await assertMemberTrip(req);
    const items = await find(db.schedules, { tripId: tripIdParam(req), isDeleted: false });
    return responseHandler({ res, response: items });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const addSchedule = async (req, res) => {
  try {
    await assertAdminTrip(req);
    const item = await insertNewDocument(db.schedules, {
      tripId: tripIdParam(req),
      title: req.body.title,
      checkpoint: req.body.checkpoint,
      scheduledAt: req.body.scheduledAt,
      notes: req.body.notes,
    });
    return responseHandler({ res, message: messages.CREATED, response: item });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

/* ─── Itinerary ─────────────────────────────────────────────────────────────── */

const listItinerary = async (req, res) => {
  try {
    await assertMemberTrip(req);
    const items = await find(db.itinerary, { tripId: tripIdParam(req), isDeleted: false }, { orderNo: 1, sequenceOrder: 1 });
    return responseHandler({ res, response: items });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const addItinerary = async (req, res) => {
  try {
    await assertAdminTrip(req);
    const { pointName, locationName, description, visitDate, visitTime, duration, notes, sequenceOrder, orderNo, isReached, images, location } = req.body;
    if (!pointName?.trim()) throw "Point name is required";

    const existing = await find(db.itinerary, { tripId: tripIdParam(req), isDeleted: false }, { sequenceOrder: -1 });
    const nextOrder = sequenceOrder !== undefined ? Number(sequenceOrder) : (existing.length > 0 ? (existing[0].sequenceOrder || 0) + 1 : 1);

    const item = await insertNewDocument(db.itinerary, {
      tripId: tripIdParam(req),
      pointName: pointName.trim(),
      locationName: locationName || "",
      description: description || "",
      visitDate: visitDate || null,
      visitTime: visitTime || "",
      duration: duration || "",
      notes: notes || "",
      sequenceOrder: nextOrder,
      orderNo: orderNo !== undefined ? Number(orderNo) : 0,
      isReached: !!isReached,
      images: Array.isArray(images) ? images : [],
      location: location && location.lat != null ? location : null,
      createdBy: req.user.userId,
    });
    return responseHandler({ res, message: messages.CREATED, response: item });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const updateItinerary = async (req, res) => {
  try {
    await assertAdminTrip(req);
    const existing = await findOne(db.itinerary, { _id: req.params.id, tripId: tripIdParam(req), isDeleted: false });
    if (!existing) throw messages.NOT_FOUND;

    const update = {};
    for (const field of ["pointName", "locationName", "description", "visitDate", "visitTime", "duration", "notes", "sequenceOrder", "orderNo", "isReached", "images", "location"]) {
      if (req.body[field] !== undefined) update[field] = req.body[field];
    }
    if (update.pointName !== undefined) {
      update.pointName = String(update.pointName).trim();
      if (!update.pointName) throw "Point name is required";
    }
    if (update.sequenceOrder !== undefined) update.sequenceOrder = Number(update.sequenceOrder);
    if (update.orderNo !== undefined) update.orderNo = Number(update.orderNo);
    if (update.isReached !== undefined) update.isReached = !!update.isReached;

    const updated = await updateDocument(db.itinerary, { _id: existing._id }, update);
    return responseHandler({ res, message: messages.UPDATED, response: updated });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const deleteItinerary = async (req, res) => {
  try {
    await assertAdminTrip(req);
    const existing = await findOne(db.itinerary, { _id: req.params.id, tripId: tripIdParam(req), isDeleted: false });
    if (!existing) throw messages.NOT_FOUND;
    await updateDocument(db.itinerary, { _id: existing._id }, { isDeleted: true });
    return responseHandler({ res, message: messages.DELETED });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const reorderItinerary = async (req, res) => {
  try {
    await assertAdminTrip(req);
    const { order } = req.body;
    if (!Array.isArray(order) || !order.length) throw "Order array is required";
    await Promise.all(
      order.map(({ id, sequenceOrder }) =>
        updateDocument(db.itinerary, { _id: id, tripId: tripIdParam(req), isDeleted: false }, { sequenceOrder: Number(sequenceOrder) })
      )
    );
    return responseHandler({ res, message: messages.UPDATED });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

/* ─── Share Collection ───────────────────────────────────────────────────────── */

const recalcShare = (doc) => {
  const paidAmount = (doc.transactions || []).reduce((sum, t) => sum + (t.paymentAmount || 0), 0);
  const pendingAmount = Math.max(0, (doc.totalShareAmount || 0) - paidAmount);
  let paymentStatus = "pending";
  if (paidAmount > 0 && paidAmount >= (doc.totalShareAmount || 0)) paymentStatus = "paid";
  else if (paidAmount > 0) paymentStatus = "partial";
  return { paidAmount, pendingAmount, paymentStatus };
};

const listShareCollections = async (req, res) => {
  try {
    await assertAdminTrip(req);
    const items = await Models[db.shareCollection]
      .find({ tripId: tripIdParam(req), isDeleted: false })
      .populate("userId", "name email mobileNumber profileImage")
      .populate("transactions.collectedBy", "name")
      .sort({ createdAt: 1 })
      .lean();
    return responseHandler({ res, response: items });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const addShareCollection = async (req, res) => {
  try {
    await assertAdminTrip(req);
    const { userId, totalShareAmount } = req.body;
    if (!userId) throw "Participant user is required";
    if (totalShareAmount === undefined || totalShareAmount === null) throw "Share amount is required";

    const dup = await findOne(db.shareCollection, {
      tripId: tripIdParam(req),
      userId: new mongoose.Types.ObjectId(userId),
      isDeleted: false,
    });
    if (dup) throw "This participant already has a share record for this trip";

    const share = Number(totalShareAmount) || 0;
    const raw = await insertNewDocument(db.shareCollection, {
      tripId: tripIdParam(req),
      userId: new mongoose.Types.ObjectId(userId),
      totalShareAmount: share,
      paidAmount: 0,
      pendingAmount: share,
      paymentStatus: "pending",
      transactions: [],
    });

    const populated = await Models[db.shareCollection]
      .findById(raw._id)
      .populate("userId", "name email mobileNumber profileImage")
      .lean();
    return responseHandler({ res, message: messages.CREATED, response: populated });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const updateShareCollection = async (req, res) => {
  try {
    await assertAdminTrip(req);
    const doc = await Models[db.shareCollection].findOne({ _id: req.params.id, tripId: tripIdParam(req), isDeleted: false });
    if (!doc) throw messages.NOT_FOUND;

    if (req.body.totalShareAmount !== undefined) doc.totalShareAmount = Number(req.body.totalShareAmount) || 0;
    const calcs = recalcShare(doc.toObject());
    doc.paidAmount = calcs.paidAmount;
    doc.pendingAmount = calcs.pendingAmount;
    doc.paymentStatus = calcs.paymentStatus;
    await doc.save();

    const populated = await Models[db.shareCollection]
      .findById(doc._id)
      .populate("userId", "name email mobileNumber profileImage")
      .populate("transactions.collectedBy", "name")
      .lean();
    return responseHandler({ res, message: messages.UPDATED, response: populated });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const addPaymentTransaction = async (req, res) => {
  try {
    await assertAdminTrip(req);
    const { paymentAmount, paymentMode, paymentDate, transactionRef, remarks, imageUrl } = req.body;
    if (!paymentAmount) throw "Payment amount is required";

    const doc = await Models[db.shareCollection].findOne({ _id: req.params.id, tripId: tripIdParam(req), isDeleted: false });
    if (!doc) throw messages.NOT_FOUND;

    const amount = Number(paymentAmount);
    if (amount <= 0) throw "Payment amount must be greater than zero";
    const newPaid = (doc.paidAmount || 0) + amount;
    if (newPaid > doc.totalShareAmount) {
      throw `Amount exceeds balance. Maximum payable: ${doc.totalShareAmount - doc.paidAmount}`;
    }

    doc.transactions.push({
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      paymentAmount: amount,
      paymentMode: paymentMode || "offline",
      transactionRef: transactionRef || "",
      remarks: remarks || "",
      imageUrl: imageUrl || "",
      collectedBy: new mongoose.Types.ObjectId(req.user.userId),
    });

    const calcs = recalcShare(doc.toObject());
    doc.paidAmount = calcs.paidAmount;
    doc.pendingAmount = calcs.pendingAmount;
    doc.paymentStatus = calcs.paymentStatus;
    await doc.save();

    const populated = await Models[db.shareCollection]
      .findById(doc._id)
      .populate("userId", "name email mobileNumber profileImage")
      .populate("transactions.collectedBy", "name")
      .lean();
    return responseHandler({ res, message: messages.CREATED, response: populated });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

/** Super-admin-only via the router's superAdminOnly guard — edits an already-recorded payment. */
const updatePaymentTransaction = async (req, res) => {
  try {
    await assertAdminTrip(req);
    const doc = await Models[db.shareCollection].findOne({ _id: req.params.id, tripId: tripIdParam(req), isDeleted: false });
    if (!doc) throw messages.NOT_FOUND;

    const tx = doc.transactions.id(req.params.paymentId);
    if (!tx) throw "Payment record not found";

    const { paymentAmount, paymentMode, paymentDate, transactionRef, remarks, imageUrl } = req.body;

    if (paymentAmount !== undefined) {
      const amount = Number(paymentAmount);
      if (amount <= 0) throw "Payment amount must be greater than zero";
      const otherPaid = doc.transactions.reduce(
        (sum, t) => sum + (String(t._id) === req.params.paymentId ? 0 : (t.paymentAmount || 0)),
        0
      );
      if (otherPaid + amount > doc.totalShareAmount) {
        throw `Amount exceeds balance. Maximum payable: ${doc.totalShareAmount - otherPaid}`;
      }
      tx.paymentAmount = amount;
    }
    if (paymentMode !== undefined) tx.paymentMode = paymentMode;
    if (paymentDate !== undefined) tx.paymentDate = paymentDate ? new Date(paymentDate) : tx.paymentDate;
    if (transactionRef !== undefined) tx.transactionRef = transactionRef;
    if (remarks !== undefined) tx.remarks = remarks;
    if (imageUrl !== undefined) tx.imageUrl = imageUrl;

    const calcs = recalcShare(doc.toObject());
    doc.paidAmount = calcs.paidAmount;
    doc.pendingAmount = calcs.pendingAmount;
    doc.paymentStatus = calcs.paymentStatus;
    await doc.save();

    const populated = await Models[db.shareCollection]
      .findById(doc._id)
      .populate("userId", "name email mobileNumber profileImage")
      .populate("transactions.collectedBy", "name")
      .lean();
    return responseHandler({ res, message: messages.UPDATED, response: populated });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const deletePaymentTransaction = async (req, res) => {
  try {
    await assertAdminTrip(req);
    const doc = await Models[db.shareCollection].findOne({ _id: req.params.id, tripId: tripIdParam(req), isDeleted: false });
    if (!doc) throw messages.NOT_FOUND;

    const txIdx = doc.transactions.findIndex((t) => String(t._id) === req.params.paymentId);
    if (txIdx === -1) throw "Payment record not found";
    doc.transactions.splice(txIdx, 1);

    const calcs = recalcShare(doc.toObject());
    doc.paidAmount = calcs.paidAmount;
    doc.pendingAmount = calcs.pendingAmount;
    doc.paymentStatus = calcs.paymentStatus;
    await doc.save();

    const populated = await Models[db.shareCollection]
      .findById(doc._id)
      .populate("userId", "name email mobileNumber profileImage")
      .populate("transactions.collectedBy", "name")
      .lean();
    return responseHandler({ res, message: messages.DELETED, response: populated });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const deleteShareCollection = async (req, res) => {
  try {
    await assertAdminTrip(req);
    const existing = await findOne(db.shareCollection, { _id: req.params.id, tripId: tripIdParam(req), isDeleted: false });
    if (!existing) throw messages.NOT_FOUND;
    await updateDocument(db.shareCollection, { _id: existing._id }, { isDeleted: true });
    return responseHandler({ res, message: messages.DELETED });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const getUserShareCollection = async (req, res) => {
  try {
    await assertMemberTrip(req);
    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const item = await Models[db.shareCollection]
      .findOne({ tripId: tripIdParam(req), userId, isDeleted: false })
      .populate("transactions.collectedBy", "name")
      .lean();
    return responseHandler({ res, response: item || null });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const listSyncStatus = async (req, res) => {
  try {
    const trip = await assertAdminTrip(req);
    const users = await find(db.users, {
      _id: { $in: trip.members || [] },
      isDeleted: false,
    });
    const syncRows = await find(db.memberSync, { tripId: tripIdParam(req) });
    const syncMap = Object.fromEntries(syncRows.map((s) => [s.userId.toString(), s]));

    const response = users.map((u) => ({
      userId: u._id,
      name: u.name,
      email: u.email,
      mobileNumber: u.mobileNumber,
      hasFcmToken: !!(u.fcmToken && u.fcmToken.length > 0),
      ...(syncMap[u._id.toString()] || {
        isOnline: false,
        alarmReceived: false,
        alarmOpened: false,
        alarmStopped: false,
      }),
    }));

    return responseHandler({ res, response });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const userListExpenses = async (req, res) => {
  try {
    await assertMemberTrip(req);
    const items = await find(db.expenses, { tripId: tripIdParam(req), isDeleted: false });
    return responseHandler({ res, response: items });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const userListTasks = async (req, res) => {
  try {
    await assertMemberTrip(req);
    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const tasks = await populateTask(
      Models[db.tasks]
        .find({ tripId: tripIdParam(req), isDeleted: false, assignedTo: userId })
        .sort({ createdAt: -1 })
    ).lean();
    return responseHandler({ res, response: tasks });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const userPendingTasks = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const tasks = await populateTask(
      Models[db.tasks].find({
        isDeleted: false,
        assignedTo: userId,
        acknowledgments: {
          $elemMatch: { userId, status: "pending" },
        },
      }).sort({ createdAt: -1 })
    ).lean();
    return responseHandler({ res, response: tasks, recordsCount: tasks.length });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const listSponsors = async (req, res) => {
  try {
    await assertAdminTrip(req);
    const items = await find(db.sponsors, { tripId: tripIdParam(req), isDeleted: false });
    return responseHandler({ res, response: items });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const addSponsor = async (req, res) => {
  try {
    await assertAdminTrip(req);
    if (!req.body.sponsorName?.trim()) throw "Sponsor name is required";
    const item = await insertNewDocument(db.sponsors, {
      ...req.body,
      tripId:  tripIdParam(req),
      amount:  Number(req.body.amount) || 0,
      createdBy: req.user.userId,
    });
    return responseHandler({ res, message: messages.CREATED, response: item });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const updateSponsor = async (req, res) => {
  try {
    await assertAdminTrip(req);
    const item = await findOne(db.sponsors, {
      _id: req.params.id,
      tripId: tripIdParam(req),
      isDeleted: false,
    });
    if (!item) throw messages.NOT_FOUND;
    const updated = await updateDocument(db.sponsors, { _id: item._id }, {
      ...req.body,
      amount: req.body.amount !== undefined ? Number(req.body.amount) : item.amount,
    });
    return responseHandler({ res, message: messages.UPDATED, response: updated });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const deleteSponsor = async (req, res) => {
  try {
    await assertAdminTrip(req);
    const item = await updateDocument(
      db.sponsors,
      { _id: req.params.id, tripId: tripIdParam(req), isDeleted: false },
      { isDeleted: true }
    );
    if (!item) throw messages.NOT_FOUND;
    return responseHandler({ res, message: messages.DELETED });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const userListSponsors = async (req, res) => {
  try {
    await assertMemberTrip(req);
    const items = await find(db.sponsors, { tripId: tripIdParam(req), isDeleted: false });
    return responseHandler({ res, response: items });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

module.exports = {
  listExpenses,
  addExpense,
  updateExpense,
  deleteExpense,
  updateTripBudget,
  listTasks,
  addTask,
  updateTask,
  deleteTask,
  acknowledgeTask,
  listVehicles,
  addVehicle,
  updateVehicle,
  deleteVehicle,
  userListVehicles,
  listHotels,
  addHotel,
  updateHotel,
  deleteHotel,
  userListHotels,
  listAttendance,
  listAttendanceCheckpoints,
  updateAttendanceRecord,
  upsertAttendance,
  userListAttendance,
  signUpload,
  resolveMapLink,
  listMedia,
  getMediaItem,
  addMedia,
  deleteMedia,
  deleteOwnMedia,
  listPolls,
  addPoll,
  votePoll,
  listTripMembers,
  listChecklists,
  getChecklistItem,
  addChecklist,
  updateChecklist,
  deleteChecklist,
  toggleChecklistItem,
  listSchedules,
  addSchedule,
  listSyncStatus,
  userListExpenses,
  userListTasks,
  userPendingTasks,
  listItinerary,
  addItinerary,
  updateItinerary,
  deleteItinerary,
  reorderItinerary,
  listShareCollections,
  addShareCollection,
  updateShareCollection,
  addPaymentTransaction,
  updatePaymentTransaction,
  deletePaymentTransaction,
  deleteShareCollection,
  getUserShareCollection,
  listSponsors,
  addSponsor,
  updateSponsor,
  deleteSponsor,
  userListSponsors,
};
