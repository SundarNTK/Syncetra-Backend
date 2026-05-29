const fs = require("fs");
const path = require("path");
const Env = require("../environment");

let firebaseApp = null;

const initFirebase = () => {
  if (!Env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    console.warn("Firebase not configured. Push notifications will be skipped.");
    return null;
  }

  try {
    const admin = require("firebase-admin");
    const accountPath = path.resolve(Env.FIREBASE_SERVICE_ACCOUNT_PATH);

    if (!fs.existsSync(accountPath)) {
      console.warn("Firebase service account file not found:", accountPath);
      return null;
    }

    const serviceAccount = require(accountPath);
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
