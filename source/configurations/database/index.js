const mongoose = require("mongoose");
const Env = require("../environment");

const buildMongoUri = () => {
  if (Env.MONGODB_URI) {
    return Env.MONGODB_URI;
  }
  if (!Env.DB_HOST || !Env.DB_USERNAME) {
    return null;
  }
  return `mongodb+srv://${encodeURIComponent(Env.DB_USERNAME)}:${encodeURIComponent(Env.DB_PASSWORD)}@${Env.DB_HOST}/${Env.DB_NAME}?${Env.DB_OPTIONS}`;
};

const connectDataBase = () => {
  const DB_URI = buildMongoUri();

  if (!DB_URI) {
    console.warn(
      "MongoDB not configured. Set MONGODB_URI in alarm-service/.env"
    );
    return;
  }

  mongoose
    .connect(DB_URI, {
      maxPoolSize: parseInt(process.env.DB_MAXPOOLSIZE || "10", 10),
      minPoolSize: parseInt(process.env.DB_MINPOOLSIZE || "2", 10),
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 30000,
      heartbeatFrequencyMS: 10000,
    })
    .then(() => console.log("MongoDB connected"))
    .catch((err) => console.error("MongoDB connection error:", err.message));
};

module.exports = connectDataBase;
