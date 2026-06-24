const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('/Users/quang.vuhuu/.gemini/antigravity/scratch/hr-management/second-brain-ebc09-firebase-adminsdk-fbsvc-c956b6cdd3.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function run() {
  const dateStr = new Date().toISOString().split('T')[0];
  const docRef = db.collection('recommendation_logs').doc(dateStr);
  
  await docRef.delete();
  console.log('Deleted log for', dateStr);
  
  const cacheRef = db.collection('ai_cache').doc('deep-recommendations');
  await cacheRef.delete();
  console.log('Deleted ai_cache deep-recommendations');
  
  process.exit(0);
}

run().catch(console.error);
