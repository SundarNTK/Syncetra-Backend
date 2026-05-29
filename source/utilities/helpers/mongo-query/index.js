const Models = require("../../../models");

const find = async (modelDb, queryObj, sortQuery = { createdAt: -1 }) =>
  await Models[modelDb].find(queryObj).sort(sortQuery).lean().exec();

const findWithProjection = async (modelDb, queryObj, projection, sortQuery = { createdAt: -1 }) =>
  await Models[modelDb].find(queryObj, projection).sort(sortQuery).lean().exec();

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
  return { data, count };
};

const findOne = async (modelDb, queryObj) =>
  await Models[modelDb].findOne(queryObj).lean().exec();

const insertNewDocument = async (modelDb, storeObj) => {
  const data = new Models[modelDb](storeObj);
  return await data.save();
};

const updateDocument = async (modelDb, queryObj, updateObj) =>
  await Models[modelDb]
    .findOneAndUpdate(queryObj, updateObj, { new: true })
    .lean()
    .exec();

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
