import * as admin from "firebase-admin";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function init() {
  if (admin.apps.length > 0) return;
  const keyB64 = process.env.FIREBASE_ADMIN_KEY_BASE64;
  if (!keyB64) throw new Error("FIREBASE_ADMIN_KEY_BASE64 not configured");
  const credential = JSON.parse(Buffer.from(keyB64, "base64").toString("utf-8"));
  admin.initializeApp({ credential: admin.credential.cert(credential) });
}

export function adminAuth() {
  init();
  return getAuth();
}

export function adminDb() {
  init();
  return getFirestore();
}
