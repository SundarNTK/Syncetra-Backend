const nodemailer = require("nodemailer");
const Env = require("../../configurations/environment");

const BREVO_API = "https://api.brevo.com/v3";

let transporter = null;

const isPlaceholder = (value) =>
  !value ||
  /your\.email|your_16|example\.com|changeme|xxx/i.test(String(value));

const isBrevoConfigured = () => !isPlaceholder(Env.BREVO_API_KEY);

const getBrevoApiKey = () => {
  const key = String(Env.BREVO_API_KEY || "").trim();
  if (key.startsWith("xsmtpsib-")) {
    throw new Error(
      "BREVO_API_KEY is an SMTP key (xsmtpsib-). Use an API key (xkeysib-) from Brevo → Settings → SMTP & API → API keys."
    );
  }
  return key;
};

const isGmailConfigured = () =>
  !isPlaceholder(Env.GMAIL_USER) && !isPlaceholder(Env.GMAIL_APP_PASSWORD);

const isEmailConfigured = () => isBrevoConfigured() || isGmailConfigured();

const getFromEmail = () => (Env.EMAIL_FROM || Env.GMAIL_USER || "").trim();

const getEmailLogoUrl = () => {
  const custom = String(Env.EMAIL_LOGO_URL || "").trim();
  if (custom) return custom;
  const base = (Env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
  return `${base}/Full_logo.png`;
};

const emailLogoHeader = () => {
  const url = getEmailLogoUrl();
  return `
    <div style="text-align:center;margin:0 0 24px">
      <img
        src="${url}"
        alt="Syncetra"
        width="200"
        style="display:block;max-width:200px;width:200px;height:auto;margin:0 auto;border:0;outline:none;text-decoration:none"
      />
    </div>
  `;
};

const syncetraDarkEmail = (bodyHtml) => `
  <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#0f172a;color:#e2e8f0;border-radius:12px">
    ${emailLogoHeader()}
    ${bodyHtml}
  </div>
`;

const syncetraLightEmail = (bodyHtml) => `
  <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
    ${emailLogoHeader()}
    ${bodyHtml}
  </div>
`;

/** Prefer Brevo on Render — Gmail SMTP is blocked on free tier. */
const getEmailProvider = () => {
  if (isBrevoConfigured()) return "brevo";
  if (isGmailConfigured()) return "gmail";
  return null;
};

const getAppPassword = () =>
  String(Env.GMAIL_APP_PASSWORD || "").replace(/\s/g, "");

const getTransporter = () => {
  if (!isGmailConfigured()) return null;
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

const sendViaBrevo = async ({ to, subject, text, html, fromName = "Syncetra" }) => {
  const fromEmail = getFromEmail();
  if (!fromEmail) {
    throw new Error("Set EMAIL_FROM (or GMAIL_USER) to your verified Brevo sender address");
  }

  const res = await fetch(`${BREVO_API}/smtp/email`, {
    method: "POST",
    headers: {
      "api-key": getBrevoApiKey(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: fromName, email: fromEmail },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    let detail = body;
    try {
      detail = JSON.parse(body).message || body;
    } catch {
      /* keep raw body */
    }
    throw new Error(`Brevo send failed: ${detail}`);
  }
};

const sendViaGmail = async ({ to, subject, text, html, fromName = "Syncetra" }) => {
  const transport = getTransporter();
  const from = getFromEmail();
  await transport.sendMail({
    from: `"${fromName}" <${from}>`,
    to,
    subject,
    text,
    html,
  });
};

const deliverEmail = async ({ to, subject, text, html, fromName }) => {
  const provider = getEmailProvider();
  if (!provider) {
    throw new Error(
      "Email not configured. Set BREVO_API_KEY (Render free tier) or GMAIL_USER + GMAIL_APP_PASSWORD (local/paid Render)."
    );
  }

  if (provider === "brevo") {
    await sendViaBrevo({ to, subject, text, html, fromName });
    return { sent: true, provider: "brevo" };
  }

  try {
    await sendViaGmail({ to, subject, text, html, fromName });
    return { sent: true, provider: "gmail" };
  } catch (err) {
    const msg = err.message || String(err);
    if (msg.includes("535") || msg.includes("BadCredentials")) {
      throw new Error(
        "Gmail rejected the login. Use a Google App Password (16 characters), not your normal Gmail password."
      );
    }
    throw new Error(`Failed to send email: ${msg}`);
  }
};

const verifyEmailConnection = async () => {
  if (isBrevoConfigured()) {
    try {
      const res = await fetch(`${BREVO_API}/account`, {
        headers: {
          "api-key": getBrevoApiKey(),
          Accept: "application/json",
        },
      });
      if (!res.ok) {
        return { ok: false, provider: "brevo", message: `Brevo API key invalid (${res.status})` };
      }
      return { ok: true, provider: "brevo", message: "Brevo API connection OK" };
    } catch (err) {
      return { ok: false, provider: "brevo", message: err.message };
    }
  }

  const transport = getTransporter();
  if (!transport) {
    return { ok: false, provider: "gmail", message: "Gmail credentials not set in .env" };
  }
  try {
    await transport.verify();
    return { ok: true, provider: "gmail", message: "Gmail SMTP connection OK" };
  } catch (err) {
    return { ok: false, provider: "gmail", message: err.message };
  }
};

const verifyGmailConnection = verifyEmailConnection;

const sendOtpEmail = async (email, otp) => {
  await deliverEmail({
    to: email,
    fromName: "Syncetra",
    subject: "Your Syncetra login code",
    text: `Your OTP is ${otp}. It expires in ${Env.OTP_EXPIRY_MINUTES} minutes.`,
    html: syncetraLightEmail(`
        <p>Your one-time login code:</p>
        <p style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#111">${otp}</p>
        <p style="color:#666;font-size:14px">Valid for ${Env.OTP_EXPIRY_MINUTES} minutes.</p>
    `),
  });
  return true;
};

const sendMemberInviteEmail = async (email, { name, groupName, mobileNumber }) => {
  if (!isEmailConfigured()) {
    console.warn("[Email] Email not configured — skip member invite email");
    return false;
  }

  const loginUrl = Env.FRONTEND_URL;
  await deliverEmail({
    to: email,
    fromName: "Syncetra",
    subject: `You were added to group: ${groupName}`,
    html: syncetraLightEmail(`
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
    `),
  });
  return true;
};

const buildCopyLinkUrl = (targetUrl) => {
  const base = (Env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
  return `${base}/#/copy-link?url=${encodeURIComponent(targetUrl)}`;
};

const sendPasswordSetupEmail = async (email, { name, setupUrl }) => {
  if (!isEmailConfigured()) {
    console.warn(`[Email] Email not configured — password setup link: ${setupUrl}`);
    return { sent: false, setupUrl };
  }

  const copyLinkUrl = buildCopyLinkUrl(setupUrl);

  await deliverEmail({
    to: email,
    subject: "Set up your Syncetra password",
    text: `Hi ${name},\n\nClick the link below to create your password:\n${setupUrl}\n\nThis link expires in 48 hours.`,
    html: syncetraDarkEmail(`
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
    `),
  });

  return { sent: true };
};

const sendPasswordChangedEmail = async (email, { name }) => {
  if (!isEmailConfigured()) return { sent: false };
  await deliverEmail({
    to: email,
    subject: "Your Syncetra password was changed",
    html: syncetraDarkEmail(`
        <p>Hi <strong>${name}</strong>,</p>
        <p>Your password has been changed successfully.</p>
        <p style="color:#94a3b8;font-size:13px">If you did not make this change, please contact your administrator immediately.</p>
    `),
  });
  return { sent: true };
};

const sendPasswordResetOtpEmail = async (email, { name, otp, expiryMinutes }) => {
  if (!isEmailConfigured()) {
    console.warn(`[Email] Email not configured — reset OTP: ${otp}`);
    return { sent: false, otp };
  }
  await deliverEmail({
    to: email,
    subject: "Syncetra — Password Reset OTP",
    html: syncetraDarkEmail(`
        <p>Hi <strong>${name}</strong>,</p>
        <p>Use the OTP below to reset your password. It expires in <strong>${expiryMinutes} minutes</strong>.</p>
        <p style="font-size:36px;font-weight:bold;letter-spacing:10px;color:#f97316;text-align:center;margin:24px 0">${otp}</p>
        <p style="color:#94a3b8;font-size:13px">If you did not request a password reset, you can safely ignore this email.</p>
    `),
  });
  return { sent: true };
};

module.exports = {
  sendOtpEmail,
  sendPasswordSetupEmail,
  sendMemberInviteEmail,
  sendPasswordChangedEmail,
  sendPasswordResetOtpEmail,
  isBrevoConfigured,
  isGmailConfigured,
  isEmailConfigured,
  verifyEmailConnection,
  verifyGmailConnection,
};
