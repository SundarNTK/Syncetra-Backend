const Env = require("../environment");

const parseOrigins = (value) => {
  if (!value || value === "*") return true;
  const list = String(value)
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  if (list.length === 0) return true;
  if (list.length === 1) return list[0];
  return list;
};

const allowedOrigins = parseOrigins(Env.CORS_ORIGIN);

const corsConfig = {
  origin: allowedOrigins,
  credentials: true,
};

module.exports = { corsConfig, allowedOrigins };
