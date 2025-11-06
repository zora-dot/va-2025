import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { initializeFirebase } from "@/lib/firebase/client";

export async function initFCM() {
  const { enabled } = initializeFirebase();
  if (!enabled || !("Notification" in window)) return null;

  const messaging = getMessaging();
  const token = await getToken(messaging, { vapidKey: import.meta.env.VITE_FCM_VAPID_KEY });
  console.log("FCM token", token); // store in Firestore if you want
  onMessage(messaging, (p) => console.log("push (foreground):", p));
  return token;
}
