const Env = require("../../configurations/environment");

/**
 * SMS providers for PROD OTP
 * Set SMS_PROVIDER=fast2sms or twilio in alarm-service/.env
 */

const sendViaTwilio = async (mobileNumber, otp) => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    throw "Twilio not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER in alarm-service/.env";
  }

  const to = mobileNumber.startsWith("+") ? mobileNumber : `+91${mobileNumber}`;
  const body = `Your Group Alarm OTP is ${otp}. Valid for ${Env.OTP_EXPIRY_MINUTES} minutes.`;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const params = new URLSearchParams({ To: to, From: fromNumber, Body: body });
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("[SMS][Twilio]", errText);
    throw "Failed to send OTP via Twilio. Check Twilio credentials and phone number.";
  }
  return true;
};

const sendViaFast2Sms = async (mobileNumber, otp) => {
  const apiKey = process.env.FAST2SMS_API_KEY;
  if (!apiKey) {
    throw "Fast2SMS not configured. Set FAST2SMS_API_KEY in alarm-service/.env (get key from fast2sms.com)";
  }

  const response = await fetch("https://www.fast2sms.com/dev/bulkV2", {
    method: "POST",
    headers: {
      authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      route: "otp",
      variables_values: otp,
      numbers: mobileNumber.replace(/\D/g, "").slice(-10),
    }),
  });

  const result = await response.json();
  if (!response.ok || result.return === false) {
    console.error("[SMS][Fast2SMS]", result);
    throw result.message || "Failed to send OTP via Fast2SMS";
  }
  return true;
};

const sendOtpSms = async (mobileNumber, otp) => {
  const provider = (process.env.SMS_PROVIDER || "fast2sms").toLowerCase();

  if (provider === "twilio") {
    return sendViaTwilio(mobileNumber, otp);
  }
  if (provider === "fast2sms") {
    return sendViaFast2Sms(mobileNumber, otp);
  }
  throw `Unknown SMS_PROVIDER "${provider}". Use fast2sms or twilio.`;
};

module.exports = { sendOtpSms };
