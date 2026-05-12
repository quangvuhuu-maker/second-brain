import { initializeApp, getApps, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function initAdmin() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  // Ưu tiên 1: Service Account Key từ biến môi trường
  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (serviceAccountKey) {
    try {
      const parsed = JSON.parse(serviceAccountKey);
      return initializeApp({ credential: cert(parsed) });
    } catch {
      // Fallback nếu parse lỗi
    }
  }

  // Ưu tiên 2: Application Default Credentials (GCP environments)
  try {
    return initializeApp({ credential: applicationDefault() });
  } catch {
    // Fallback
  }

  // Ưu tiên 3: Chỉ dùng projectId (hạn chế, chỉ dùng dev)
  return initializeApp({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
}

const adminApp = initAdmin();
export const adminDb = getFirestore(adminApp);
