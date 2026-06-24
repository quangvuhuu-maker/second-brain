const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');

const serviceAccountStr = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || "";
if (!serviceAccountStr) {
  require('dotenv').config({ path: '.env.local' });
}
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function run() {
  const vnDate = new Date(new Date().getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  console.log("Deleting log for", vnDate);
  await db.collection("recommendation_logs").doc(vnDate).delete();
  await db.collection("ai_cache").doc("deep-recommendations").delete();
  console.log("Deleted.");
}
run().catch(console.error);
