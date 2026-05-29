const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");

const expressConfig = (app) => {
  app.use(bodyParser.json({ limit: "15mb" }));
  app.use(bodyParser.urlencoded({ extended: true, limit: "15mb" }));
  app.use(cookieParser());
};

module.exports = expressConfig;
