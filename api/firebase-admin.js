const { initializeApp, getApps, getApp, cert, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { getAppCheck } = require('firebase-admin/app-check');
const fs = require('fs');
const path = require('path');

let customDbId = process.env.FIRESTORE_DATABASE_ID || null;
if (!customDbId) {
  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config && config.firestoreDatabaseId) {
        customDbId = config.firestoreDatabaseId;
      }
    }
  } catch (e) {
    // Ignore error
  }
}

function serviceAccountCredential() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
    return cert(JSON.parse(decoded));
  }
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON));
  }
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    return cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    });
  }
  return applicationDefault();
}

function ensureAdminApp() {
  if (getApps().length) return getApp();
  return initializeApp({ credential: serviceAccountCredential() });
}

// Facade kompatibilitas untuk handler lama; bootstrap SDK-nya sudah modular.
const admin = {
  auth: () => getAuth(ensureAdminApp()),
  messaging: () => getMessaging(ensureAdminApp()),
  appCheck: () => getAppCheck(ensureAdminApp()),
  firestore: { FieldValue }
};

function getFirebaseAdmin() {
  try {
    const app = ensureAdminApp();
    const db = customDbId ? getFirestore(app, customDbId) : getFirestore(app);
    return { admin, db, error: null };
  } catch (error) {
    console.error('Firebase Admin initialization failed:', error.message);
    return { admin: null, db: null, error: 'Firebase Admin environment variables are not configured.' };
  }
}

module.exports = {
  admin,
  getFirebaseAdmin,
  customDbId
};
