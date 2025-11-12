import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";
import * as admin from "firebase-admin";
import { sendStudioMessage } from "./utils/studio";

if (!admin.apps.length) {
  admin.initializeApp();
}

export const processSmsOutbound = onDocumentCreated(
  {
    document: "sms_outbound/{messageId}",
    region: "us-central1",
    timeoutSeconds: 120,
    memory: "256MiB",
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const data = snap.data() ?? {};
    const toRaw = typeof data.to === "string" ? data.to.trim() : "";
    const bodyRaw = typeof data.body === "string" ? data.body.trim() : "";

    if (!toRaw || !bodyRaw) {
      logger.warn("sms_outbound missing to/body", { id: snap.ref.id });
      await snap.ref.set(
        {
          delivered: false,
          lastError: "Missing destination or message body",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      return;
    }

    try {
      await sendStudioMessage(toRaw, bodyRaw);
      await snap.ref.set(
        {
          delivered: true,
          deliveredAt: admin.firestore.FieldValue.serverTimestamp(),
          lastError: null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("sms_outbound delivery failed", { id: snap.ref.id, error: errorMessage });
      await snap.ref.set(
        {
          delivered: false,
          lastError: errorMessage,
          retryCount: admin.firestore.FieldValue.increment(1),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
  },
);
