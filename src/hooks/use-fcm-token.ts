"use client";

import { useEffect } from "react";
import { getToken } from "firebase/messaging";
import { doc, updateDoc } from "firebase/firestore";
import { db, getMessagingInstance } from "@/lib/firebase";

export function useFcmToken(shopId: string | null) {
  useEffect(() => {
    if (!shopId) return;

    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
    if (!vapidKey) return;

    async function register() {
      try {
        const messaging = await getMessagingInstance();
        if (!messaging) return;

        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        const token = await getToken(messaging, { vapidKey });
        if (!token) return;

        await updateDoc(doc(db, "Shops", shopId!), { fcmToken: token });
      } catch {
        // non-fatal — never break the UI if push setup fails
      }
    }

    register();
  }, [shopId]);
}
