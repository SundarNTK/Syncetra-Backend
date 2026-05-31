const Models = require("../../../models");

const stripVersion = (value) => {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(stripVersion);
  if (typeof value === "object") {
    const { __v, ...rest } = value;
    return rest;
  }
  return value;
};

const find = async (modelDb, queryObj, sortQuery = { createdAt: -1 }) =>
  stripVersion(await Models[modelDb].find(queryObj).sort(sortQuery).lean().exec());

const findWithProjection = async (modelDb, queryObj, projection, sortQuery = { createdAt: -1 }) =>
  stripVersion(
    await Models[modelDb].find(queryObj, projection).sort(sortQuery).lean().exec()
  );

const findWithPagination = async (
  modelDb,
  queryObj,
  sortQuery,
  skip,
  limit
) => {
  const [data, count] = await Promise.all([
    Models[modelDb].find(queryObj).sort(sortQuery).skip(skip).limit(limit).lean().exec(),
    Models[modelDb].countDocuments(queryObj),
  ]);
  return { data: stripVersion(data), count };
};

const findOne = async (modelDb, queryObj) =>
  stripVersion(await Models[modelDb].findOne(queryObj).lean().exec());

const insertNewDocument = async (modelDb, storeObj) => {
  const data = new Models[modelDb](storeObj);
  return stripVersion(await data.save().then((d) => d.toObject()));
};

const updateDocument = async (modelDb, queryObj, updateObj) =>
  stripVersion(
    await Models[modelDb]
      .findOneAndUpdate(queryObj, updateObj, { new: true })
      .lean()
      .exec()
  );

const count = async (modelDb, queryObj) =>
  await Models[modelDb].countDocuments(queryObj);

const updateMany = async (modelDb, queryObj, updateObj) =>
  await Models[modelDb].updateMany(queryObj, updateObj);

module.exports = {
  find,
  findWithProjection,
  count,
  findOne,
  findWithPagination,
  insertNewDocument,
  updateDocument,
  updateMany,
};
