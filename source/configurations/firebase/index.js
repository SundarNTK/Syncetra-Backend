const fs = require("fs");
const path = require("path");
const Env = require("../environment");

let firebaseApp = null;

const initFirebase = () => {
  const hasJson = !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const hasPath = !!Env.FIREBASE_SERVICE_ACCOUNT_PATH;

  if (!hasJson && !hasPath) {
    console.warn(
      "Firebase not configured. Push notifications will be skipped.",
    );
    return null;
  }

  try {
    const admin = require("firebase-admin");
    let serviceAccount;

    if (hasJson) {
      // Production (Render): full JSON stored as an env-var string
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } else {
      // Local dev: path to the JSON file
      const accountPath = path.resolve(Env.FIREBASE_SERVICE_ACCOUNT_PATH);
      if (!fs.existsSync(accountPath)) {
        console.warn("Firebase service account file not found:", accountPath);
        return null;
      }
      serviceAccount = require(accountPath);
    }

    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log("Firebase Admin initialized");
    return firebaseApp;
  } catch (err) {
    console.warn("Firebase init failed:", err.message);
    return null;
  }
};

const getFirebaseAdmin = () => {
  if (!firebaseApp) return null;
  return require("firebase-admin");
};

module.exports = { initFirebase, getFirebaseAdmin };
