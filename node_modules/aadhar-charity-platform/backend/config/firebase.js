const admin = require('firebase-admin');

// Check if already initialized
if (!admin.apps.length) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  if (!projectId || !privateKey || !clientEmail) {
    console.log('⚠️ Firebase Admin skipped (missing FIREBASE_* env vars). Add to backend/.env');
    module.exports = null;
  } else {
    try {
      // Handle newlines in private key (both \\n and \n formats)
      const formattedKey = privateKey
        .replace(/\\n/g, '\n')
        .replace(/\n/g, '\n');

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          privateKey: formattedKey,
          clientEmail,
        }),
      });
      console.log('✅ Firebase Admin initialized successfully');
    } catch (error) {
      console.error('❌ Firebase Admin initialization failed:', error.message);
      module.exports = null;
    }
  }
}

const fbAdmin = admin.apps.length ? admin : null;
module.exports = fbAdmin;

