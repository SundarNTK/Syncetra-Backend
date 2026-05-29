const nodemailer = require("nodemailer");
const Env = require("../../configurations/environment");

let transporter = null;

const isPlaceholder = (value) =>
  !value ||
  /your\.email|your_16|example\.com|changeme|xxx/i.test(String(value));

const isGmailConfigured = () =>
  !isPlaceholder(Env.GMAIL_USER) && !isPlaceholder(Env.GMAIL_APP_PASSWORD);

const getAppPassword = () =>
  String(Env.GMAIL_APP_PASSWORD || "").replace(/\s/g, "");

const getTransporter = () => {
  if (!isGmailConfigured()) {
    return null;
  }

  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 15000,
    auth: {
      user: Env.GMAIL_USER.trim(),
      pass: getAppPassword(),
    },
  });

  return transporter;
};

const verifyGmailConnection = async () => {
  const transport = getTransporter();
  if (!transport) {
    return { ok: false, message: "Gmail credentials not set in .env" };
  }
  try {
    await transport.verify();
    return { ok: true, message: "Gmail SMTP connection OK" };
  } catch (err) {
    return { ok: false, message: err.message };
  }
};

const sendOtpEmail = async (email, otp) => {
  if (!isGmailConfigured()) {
    throw (
      "Gmail is not configured. In alarm-service/.env set GMAIL_USER to your real Gmail address " +
      "and GMAIL_APP_PASSWORD to a Google App Password (not your normal Gmail password). " +
      "See docs/GMAIL_SETUP.md"
    );
  }

  const transport = getTransporter();
  const from = (Env.EMAIL_FROM || Env.GMAIL_USER).trim();

  try {
    await transport.sendMail({
      from: `"Group Alarm" <${from}>`,
      to: email,
      subject: "Your Group Alarm login code",
      text: `Your OTP is ${otp}. It expires in ${Env.OTP_EXPIRY_MINUTES} minutes.`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="color:#dc2626">Group Alarm</h2>
          <p>Your one-time login code:</p>
          <p style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#111">${otp}</p>
          <p style="color:#666;font-size:14px">Valid for ${Env.OTP_EXPIRY_MINUTES} minutes.</p>
        </div>
      `,
    });
    return true;
  } catch (err) {
    const msg = err.message || String(err);
    if (msg.includes("535") || msg.includes("BadCredentials")) {
      throw (
        "Gmail rejected the login. Use a Google App Password (16 characters), not your normal Gmail password. " +
        "Enable 2-Step Verification first, then create an App Password at https://myaccount.google.com/apppasswords"
      );
    }
    throw `Failed to send email: ${msg}`;
  }
};

const sendMemberInviteEmail = async (email, { name, groupName, mobileNumber }) => {
  if (!isGmailConfigured()) {
    console.warn("[Email] Gmail not configured — skip member invite email");
    return false;
  }

  const transport = getTransporter();
  const from = (Env.EMAIL_FROM || Env.GMAIL_USER).trim();
  const loginUrl = Env.FRONTEND_URL;

  await transport.sendMail({
    from: `"Group Alarm" <${from}>`,
    to: email,
    subject: `You were added to group: ${groupName}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;padding:24px">
        <h2 style="color:#dc2626">Group Alarm</h2>
        <p>Hi <strong>${name}</strong>,</p>
        <p>You were added to the group <strong>${groupName}</strong>.</p>
        <p><strong>Your mobile (for alarms):</strong> ${mobileNumber}</p>
        <p>Login with your <strong>email address</strong> to receive OTP and alarm notifications on your phone:</p>
        <p><a href="${loginUrl}/#/login" style="color:#dc2626">${loginUrl}/#/login</a></p>
        <ol>
          <li>Open the link on your mobile</li>
          <li>Choose <strong>Sign in as User</strong></li>
          <li>Enter email: <strong>${email}</strong></li>
          <li>Allow notifications when prompted</li>
        </ol>
        <p style="color:#666;font-size:13px">Alarms are sent via push notification (FCM), not SMS.</p>
      </div>
    `,
  });
  return true;
};

const buildCopyLinkUrl = (targetUrl) => {
  const base = (Env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
  return `${base}/#/copy-link?url=${encodeURIComponent(targetUrl)}`;
};

const sendPasswordSetupEmail = async (email, { name, setupUrl }) => {
  if (!isGmailConfigured()) {
    console.warn(`[Email] Gmail not configured — password setup link: ${setupUrl}`);
    return { sent: false, setupUrl };
  }

  const transport = getTransporter();
  const from = (Env.EMAIL_FROM || Env.GMAIL_USER).trim();
  const copyLinkUrl = buildCopyLinkUrl(setupUrl);

  await transport.sendMail({
    from: `"Syncetra" <${from}>`,
    to: email,
    subject: "Set up your Syncetra password",
    text: `Hi ${name},\n\nClick the link below to create your password:\n${setupUrl}\n\nThis link expires in 48 hours.`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#0f172a;color:#e2e8f0;border-radius:12px">
        <h2 style="text-align:center;color:#e2e8f0;margin-top:0;margin-bottom:24px;font-size:22px;font-weight:700;letter-spacing:1px">
          Syncetra
        </h2>
        <p>Hi <strong>${name}</strong>,</p>
        <p>Your account has been created. Click the button below to set up your password and start your journey.</p>
        <div style="text-align:center;margin:32px 0 16px">
          <a href="${setupUrl}"
             style="background:linear-gradient(to right,#dc2626,#ea580c);color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:bold;font-size:16px;display:inline-block">
            Create Password
          </a>
        </div>
        <div style="text-align:center;margin-bottom:28px">
          <a href="${copyLinkUrl}"
             style="color:#e2e8f0;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:bold;font-size:16px;display:inline-block;border:1px solid #475569;background:#1e293b">
            Copy Setup Link
          </a>
        </div>
        <p style="color:#94a3b8;font-size:13px">
          This link expires in <strong>48 hours</strong>. If you did not register, you can safely ignore this email.
        </p>
      </div>
    `,
  });

  return { sent: true };
};

const sendPasswordChangedEmail = async (email, { name }) => {
  if (!isGmailConfigured()) return { sent: false };
  const transport = getTransporter();
  const from = (Env.EMAIL_FROM || Env.GMAIL_USER).trim();
  await transport.sendMail({
    from: `"Syncetra" <${from}>`,
    to: email,
    subject: "Your Syncetra password was changed",
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#0f172a;color:#e2e8f0;border-radius:12px">
        <h2 style="color:#e2e8f0;margin-top:0">Syncetra</h2>
        <p>Hi <strong>${name}</strong>,</p>
        <p>Your password has been changed successfully.</p>
        <p style="color:#94a3b8;font-size:13px">If you did not make this change, please contact your administrator immediately.</p>
      </div>`,
  });
  return { sent: true };
};

const sendPasswordResetOtpEmail = async (email, { name, otp, expiryMinutes }) => {
  if (!isGmailConfigured()) {
    console.warn(`[Email] Gmail not configured — reset OTP: ${otp}`);
    return { sent: false, otp };
  }
  const transport = getTransporter();
  const from = (Env.EMAIL_FROM || Env.GMAIL_USER).trim();
  await transport.sendMail({
    from: `"Syncetra" <${from}>`,
    to: email,
    subject: "Syncetra — Password Reset OTP",
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#0f172a;color:#e2e8f0;border-radius:12px">
        <h2 style="color:#e2e8f0;margin-top:0">Syncetra</h2>
        <p>Hi <strong>${name}</strong>,</p>
        <p>Use the OTP below to reset your password. It expires in <strong>${expiryMinutes} minutes</strong>.</p>
        <p style="font-size:36px;font-weight:bold;letter-spacing:10px;color:#f97316;text-align:center;margin:24px 0">${otp}</p>
        <p style="color:#94a3b8;font-size:13px">If you did not request a password reset, you can safely ignore this email.</p>
      </div>`,
  });
  return { sent: true };
};

module.exports = {
  sendOtpEmail,
  sendPasswordSetupEmail,
  sendMemberInviteEmail,
  sendPasswordChangedEmail,
  sendPasswordResetOtpEmail,
  isGmailConfigured,
  verifyGmailConnection,
};
