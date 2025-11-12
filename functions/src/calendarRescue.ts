import * as admin from "firebase-admin";
import type { Request, Response } from "express";

const db = admin.firestore();
const MAX_BATCH_WRITES = 450;

const getEnvNumber = (key: string, fallback: number) => {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toDate = (value: unknown): Date => {
  if (!value) return new Date(0);
  if (value instanceof Date) return value;
  if (value instanceof admin.firestore.Timestamp) {
    return value.toDate();
  }
  if (typeof value === "number") {
    return new Date(value);
  }
  if (
    typeof value === "object" &&
    "toDate" in (value as { toDate?: () => Date }) &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  return new Date(0);
};

export const rescueUnsyncedBookings = async (req: Request, res: Response) => {
  const token = process.env.CRON_TOKEN ?? "";
  if (token && req.get("X-CRON-TOKEN") !== token) {
    res.status(403).send("forbidden");
    return;
  }

  const collectionName = process.env.COLLECTION ?? "bookings";
  const pageSize = getEnvNumber("RESCUE_PAGE", 500);
  const staleMinutes = getEnvNumber("STALE_MINUTES", 15);
  const maxRescues = getEnvNumber("MAX_RESCUES_PER_DOC", 3);
  const staleBefore = Date.now() - staleMinutes * 60 * 1000;

  let scanned = 0;
  let rescued = 0;

  const rescueQuery = async (baseQuery: admin.firestore.Query) => {
    let lastDoc: admin.firestore.QueryDocumentSnapshot | null = null;
    while (true) {
      let query = baseQuery.orderBy(admin.firestore.FieldPath.documentId()).limit(pageSize);
      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }
      const snapshot = await query.get();
      if (snapshot.empty) {
        break;
      }
      lastDoc = snapshot.docs[snapshot.docs.length - 1];

      const targets: admin.firestore.DocumentReference[] = [];
      snapshot.forEach((doc) => {
        scanned += 1;
        const data = doc.data() ?? {};
        const updatedAt = toDate(data.updatedAt);
        const rescues = typeof data.calendarRescueCount === "number" ? data.calendarRescueCount : 0;
        if (updatedAt.getTime() < staleBefore && rescues < maxRescues) {
          targets.push(doc.ref);
        }
      });

      for (let i = 0; i < targets.length; i += MAX_BATCH_WRITES) {
        const chunk = targets.slice(i, i + MAX_BATCH_WRITES);
        if (!chunk.length) continue;
        const batch = db.batch();
        chunk.forEach((ref) => {
          batch.set(
            ref,
            {
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              needsCalendarSync: true,
              calendarRescueCount: admin.firestore.FieldValue.increment(1),
            },
            { merge: true },
          );
        });
        await batch.commit();
        rescued += chunk.length;
      }
    }
  };

  await rescueQuery(db.collection(collectionName).where("needsCalendarSync", "==", true));
  await rescueQuery(db.collection(collectionName).where("calendarSynced", "==", false));

  res.json({
    scanned,
    rescued,
    staleMinutes,
    pageSize,
    maxRescuesPerDoc: maxRescues,
  });
};
