require("dotenv").config();

const EnvBoot = require("./source/configurations/environment");
const { isEmailConfigured, isBrevoConfigured, isGmailConfigured, verifyEmailConnection } = require("./source/service/email");
console.log("────────────────────────────────────────");
console.log(`  APP_ENV: ${EnvBoot.APP_ENV}  (OTP: ${EnvBoot.APP_ENV === "DEV" ? "shown in API/console" : "email only"})`);
if (isBrevoConfigured()) {
  console.log(`  Email: Brevo API (sender: ${EnvBoot.EMAIL_FROM || EnvBoot.GMAIL_USER || "set EMAIL_FROM"})`);
} else if (isGmailConfigured()) {
  console.log(`  Email: Gmail SMTP (${EnvBoot.GMAIL_USER})`);
} else {
  console.log("  Email: NOT configured");
}
if (EnvBoot.APP_ENV === "PROD" && !isEmailConfigured()) {
  console.warn("  ⚠ PROD requires BREVO_API_KEY or GMAIL_USER + GMAIL_APP_PASSWORD");
}
if (isEmailConfigured()) {
  verifyEmailConnection().then((r) => {
    console.log(r.ok ? `  ✓ ${r.message}` : `  ✗ Email error: ${r.message}`);
    if (!r.ok && r.provider === "gmail") {
      console.warn("  ⚠ Render free tier blocks Gmail SMTP. Add BREVO_API_KEY instead (see .env.sample).");
    }
  });
}
console.log("────────────────────────────────────────");

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const {
  expressConfig,
  dbConfig,
  corsConfig,
  allowedOrigins,
  serverConfig,
  Env,
} = require("./source/configurations");
const { initSocket } = require("./source/configurations/socket");
const { initFirebase } = require("./source/configurations/firebase");
const authRoutes = require("./source/routes/auth");
const publicRoutes = require("./source/routes/public");
const adminRoutes = require("./source/routes/admin");
const userRoutes = require("./source/routes/user");
const { authenticate } = require("./source/middleware/authenticate");
require("./source/utilities/schedulers/alarm-scheduler");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  },
});

initSocket(io);
initFirebase();

expressConfig(app);
dbConfig();

app.use(cors(corsConfig));
app.use(helmet());
app.use(morgan("dev"));

app.get("/health", (req, res) => {
  res.json({ success: true, message: "Group Alarm Service is running" });
});

app.use("/api/v1/alarm/public", publicRoutes);
app.use(`${Env.BASE_PATH_ADMIN}/auth`, authRoutes);
app.use(`${Env.BASE_PATH_USER}/auth`, authRoutes);
app.use(Env.BASE_PATH_ADMIN, authenticate, adminRoutes);
app.use(Env.BASE_PATH_USER, authenticate, userRoutes);

serverConfig(server, app);
