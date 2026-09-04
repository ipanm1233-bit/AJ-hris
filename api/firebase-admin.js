const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
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

function getFirebaseAdmin() {
  if (!admin.apps.length) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
      try {
        const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
        const serviceAccount = JSON.parse(decoded);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
      } catch (e) {
        console.error("Failed to initialize Firebase Admin from FIREBASE_SERVICE_ACCOUNT_BASE64:", e.message);
      }
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
      } catch (e) {
        console.error("Failed to initialize Firebase Admin from FIREBASE_SERVICE_ACCOUNT_JSON:", e.message);
      }
    } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      try {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
          })
        });
      } catch (e) {
        console.error("Failed to initialize Firebase Admin from env credentials:", e.message);
      }
    } else {
      try {
        admin.initializeApp();
      } catch (e) {
        // Fallback
      }
    }
  }

  if (!admin.apps.length) {
    return { admin: null, db: null, error: "Firebase Admin environment variables are not configured." };
  }

  try {
    const db = customDbId ? getFirestore(customDbId) : admin.firestore();
    return { admin, db, error: null };
  } catch (err) {
    console.error("Error creating Firestore instance:", err);
    return { admin, db: null, error: err.message };
  }
}

module.exports = {
  admin,
  getFirebaseAdmin,
  customDbId
};
