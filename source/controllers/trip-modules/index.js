const mongoose = require("mongoose");
const db = require("../../utilities/constants/db-name");
const Env = require("../../configurations/environment");
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
    const { title, description, status } = req.body;
    const update = {};
    if (title !== undefined) update.title = String(title).trim();
    if (description !== undefined) update.description = String(description).trim();
    if (status !== undefined) update.status = status;
    if (!Object.keys(update).length) throw "No valid fields to update";
    await updateDocument(
      db.tasks,
      { _id: req.params.id, tripId: tripIdParam(req), isDeleted: false },
      update
    );
    const populated = await populateTask(Models[db.tasks].findById(req.params.id)).lean();
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

const userListVehicles = async (req, res) => {
  try {
    await assertMemberTrip(req);
    const items = await find(db.vehicles, { tripId: tripIdParam(req), isDeleted: false });
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

const listMedia = async (req, res) => {
  try {
    await assertAdminTrip(req);
    const filter = { tripId: tripIdParam(req), isDeleted: false };
    if (req.query.userId) filter.uploadedBy = req.query.userId;
    if (req.query.category) filter.category = req.query.category;
    const items = await find(db.media, filter);
    return responseHandler({ res, response: items });
  } catch (error) {
    return exceptionHandler({ res, error });
  }
};

const getMediaItem = async (req, res) => {
  try {
    await assertAdminTrip(req);
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
    await assertMemberTrip(req);
    const { url, mediaType, category, caption, fileName } = req.body;

    if (!url || typeof url !== "string") {
      return exceptionHandler({ res, error: "Media url is required" });
    }

    const isDataUrl = url.startsWith("data:");
    const isHttpUrl = /^https?:\/\//i.test(url);
    if (!isDataUrl && !isHttpUrl) {
      return exceptionHandler({ res, error: "Use a valid image/video URL or upload a file" });
    }

    const type = mediaType === "video" ? "video" : "image";
    const allowedCategories = ["food", "travel", "moments", "other"];
    const safeCategory = allowedCategories.includes(category) ? category : "moments";

    const item = await insertNewDocument(db.media, {
      tripId: tripIdParam(req),
      uploadedBy: req.user.userId,
      url,
      thumbUrl: req.body.thumbUrl || "",
      mediaType: type,
      category: safeCategory,
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
    const item = await findOne(db.checklists, {
      _id: req.params.id,
      tripId: tripIdParam(req),
      isDeleted: false,
    });
    if (!item) throw messages.NOT_FOUND;

    const doc = await Models[db.checklists].findById(item._id);
    if (!doc) throw messages.NOT_FOUND;
    const assigneeIds = checklistAssignedUserIds(doc.assignedTo);
    if (assigneeIds.length > 0 && !assigneeIds.includes(String(req.user.userId))) {
      throw "This checklist item is assigned to another member";
    }
    const uid = new mongoose.Types.ObjectId(req.user.userId);
    const packed = doc.packedBy.some((p) => p.toString() === req.user.userId);
    if (packed) {
      doc.packedBy = doc.packedBy.filter((p) => p.toString() !== req.user.userId);
    } else {
      doc.packedBy.push(uid);
    }
    await doc.save();
    return responseHandler({ res, message: messages.UPDATED, response: doc.toObject() });
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

module.exports = {
  listExpenses,
  addExpense,
  updateExpense,
  updateTripBudget,
  listTasks,
  addTask,
  updateTask,
  deleteTask,
  acknowledgeTask,
  listVehicles,
  addVehicle,
  updateVehicle,
  userListVehicles,
  listAttendance,
  listAttendanceCheckpoints,
  updateAttendanceRecord,
  upsertAttendance,
  userListAttendance,
  listMedia,
  getMediaItem,
  addMedia,
  deleteMedia,
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
};
