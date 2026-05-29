const expressConfig = require("./express");
const dbConfig = require("./database");
const { corsConfig, allowedOrigins } = require("./cors");
const serverConfig = require("./server");
const Env = require("./environment");

module.exports = {
  expressConfig,
  dbConfig,
  corsConfig,
  allowedOrigins,
  serverConfig,
  Env,
};
