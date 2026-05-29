const { getFirebaseAdmin } = require("../../../configurations/firebase");
const { find } = require("../mongo-query");
const db = require("../../constants/db-name");

const sendPushToUsers = async (userIds, { title, body, data = {} }) => {
  const admin = getFirebaseAdmin();
  if (!admin || !userIds?.length) return { sent: 0, skipped: true };

  const users = await find(db.users, {
    _id: { $in: userIds },
    fcmToken: { $exists: true, $ne: null, $ne: "" },
    isDeleted: false,
  });

  const tokens = users.map((u) => u.fcmToken).filter(Boolean);
  if (!tokens.length) return { sent: 0 };

  const messaging = admin.messaging();
  const dataPayload = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, String(v)])
  );

  const message = {
    // No top-level "notification" key — this makes it a data-only message.
    // Data-only messages wake the service worker even when the app is closed,
    // letting the SW play custom audio and show a fully-controlled notification.
    data: {
      ...dataPayload,
      title: String(title),
      body: String(body),
      type: String(dataPayload.type || "alarm"),
    },
    webpush: {
      headers: {
        // High urgency tells browsers to deliver immediately, not batch.
        Urgency: "high",
      },
      fcmOptions: {
        link: "/",
      },
    },
    android: {
      priority: "high",
      notification: {
        // Android notification channel — must match the channel created in the SW.
        // IMPORTANCE_HIGH allows sound even in "priority" / vibrate modes.
        channelId: "alarm_channel",
        sound: "alarm_sound",  // matches res/raw/alarm_sound.mp3 in native builds
        priority: "max",
        defaultVibrateTimings: false,
        vibrateTimingsMillis: ["500", "200", "500", "200", "500"],
      },
    },
    tokens,
  };

  try {
    const result = await messaging.sendEachForMulticast(message);
    return { sent: result.successCount, failure: result.failureCount };
  } catch (err) {
    console.error("FCM send error:", err.message);
    return { sent: 0, error: err.message };
  }
};

/**
 * Sends a special SMS_COMMAND data message to all super_admin devices.
 * The mobile app's background FCM handler intercepts this and uses the
 * device SIM (via native SmsManager) to send emergency SMS to all members.
 */
const sendSmsCommandToSuperAdmin = async ({ alarmId, title, description, memberPhones }) => {
  const admin = getFirebaseAdmin();
  if (!admin) return { sent: 0, skipped: true };

  const superAdmins = await find(db.users, {
    role: "super_admin",
    fcmToken: { $exists: true, $ne: null, $ne: "" },
    isDeleted: false,
  });

  const tokens = superAdmins.map((u) => u.fcmToken).filter(Boolean);
  if (!tokens.length) return { sent: 0, noSuperAdminTokens: true };

  const smsBody = `SYNCETRA-EMERGENCY:${alarmId}:${title.slice(0, 80)}`;
  const smsRecipients = memberPhones.join(",");

  const messaging = admin.messaging();
  const message = {
    data: {
      type: "SMS_COMMAND",
      alarmId: String(alarmId),
      title: String(title),
      description: String(description || ""),
      smsBody,
      smsRecipients,
    },
    android: {
      priority: "high",
    },
    tokens,
  };

  try {
    const result = await messaging.sendEachForMulticast(message);
    return { sent: result.successCount, failure: result.failureCount };
  } catch (err) {
    console.error("FCM SMS_COMMAND send error:", err.message);
    return { sent: 0, error: err.message };
  }
};

module.exports = { sendPushToUsers, sendSmsCommandToSuperAdmin };
