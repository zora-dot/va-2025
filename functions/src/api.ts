// functions/src/api.ts
import * as admin from 'firebase-admin';
import express from 'express';
import cors from 'cors';
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { MAPS_SERVER_KEY } from './maps';
import { calculatePricing, PricingError, TripDirection } from './pricing';
import { resolveLocationDetails } from './data/locationDirectory';
import { createSquarePaymentLink } from './square';
import { syncCustomerBooking } from './utils/customerBookings';
import {
  queueEmailNotification,
  queuePushNotification,
  queueSmsNotification,
} from './notifications';
import { createQuote, serializeQuoteResponse, updateQuote, attachContact, confirmQuote, getQuote } from './quotesService';

if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();
const storage = admin.storage();

const sanitizeDisplayName = (value?: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return null;
};

const parseTipAmountToCents = (value: unknown): number | null => {
  if (typeof value === 'number') {
    if (Number.isFinite(value) && value > 0) {
      return Math.round(value * 100);
    }
    return null;
  }
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!normalized) return null;
    const numeric = Number(normalized.replace(/[^0-9.]/g, ''));
    if (Number.isFinite(numeric) && numeric > 0) {
      return Math.round(numeric * 100);
    }
  }
  return null;
};

const sanitizeStringField = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const sanitizeOptionalNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return null;
};

const sanitizeVehicleSelections = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);
};

const sanitizeContactPayload = (raw: unknown) => {
  if (!raw || typeof raw !== 'object') {
    return { name: null, email: null, phone: null, baggage: null };
  }
  const payload = raw as Record<string, unknown>;
  return {
    name: sanitizeStringField(payload.name),
    email: sanitizeStringField(payload.email),
    phone: sanitizeStringField(payload.phone),
    baggage: sanitizeStringField(payload.baggage),
  };
};

const sanitizeSchedulePayload = (raw: unknown) => {
  if (!raw || typeof raw !== 'object') {
    return { pickupDate: null, pickupTime: null, flightNumber: null, notes: null };
  }
  const payload = raw as Record<string, unknown>;
  return {
    pickupDate: sanitizeStringField(payload.pickupDate),
    pickupTime: sanitizeStringField(payload.pickupTime),
    flightNumber: sanitizeStringField(payload.flightNumber),
    notes: sanitizeStringField(payload.notes),
  };
};

const getClientIp = (req: express.Request): string | null => {
  const forwarded = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
  if (forwarded) return forwarded;
  return req.socket?.remoteAddress ?? null;
};

const customerOwnsBooking = (data: admin.firestore.DocumentData | undefined, uid: string): boolean => {
  if (!data) return false;
  const bookingUser = (data.user as { uid?: unknown }) || {};
  if (typeof bookingUser.uid === 'string' && bookingUser.uid.trim().length > 0) {
    return bookingUser.uid === uid;
  }
  return false;
};

const CANCELLABLE_STATUSES = new Set([
  'pending',
  'awaiting_payment',
  'confirmed',
  'assigned',
  'en_route',
  'arrived',
  'on_trip',
]);

// Secrets: set with `firebase functions:secrets:set ...`
const SQUARE_ACCESS_TOKEN = defineSecret('VALLEY_SQUARE_ACCESS_TOKEN');
const BOOTSTRAP_ADMIN_EMAIL = defineSecret('BOOTSTRAP_ADMIN_EMAIL');

const app = express();
app.use(
  cors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }),
);
app.options('*', cors({ origin: true }));
app.use(express.json());

// ---------- Auth helpers ----------
type AuthedReq = express.Request & {
  user?: { uid: string; email?: string | null; admin?: boolean; anonymous?: boolean };
};

const auth = async (req: AuthedReq, res: express.Response, next: express.NextFunction) => {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer (.+)$/);
  if (!m) return res.status(401).json({ error: 'Missing ID token' });
  try {
    const decoded = await admin.auth().verifyIdToken(m[1]);
    req.user = {
      uid: decoded.uid,
      email: (decoded.email as string) ?? null,
      admin: decoded.admin === true || decoded.role === 'admin',
      anonymous: decoded.firebase?.sign_in_provider === 'anonymous',
    };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid ID token' });
  }
};

const optionalAuth = async (req: AuthedReq, res: express.Response, next: express.NextFunction) => {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer (.+)$/);
  if (!m) {
    next();
    return;
  }
  try {
    const decoded = await admin.auth().verifyIdToken(m[1]);
    req.user = {
      uid: decoded.uid,
      email: (decoded.email as string) ?? null,
      admin: decoded.admin === true || decoded.role === 'admin',
      anonymous: decoded.firebase?.sign_in_provider === 'anonymous',
    };
  } catch (error) {
    console.error('optionalAuth: failed to verify token', error);
    // fallthrough without user
  }
  next();
};

const requireSelfOrAdmin =
  (uidParam = 'uid') => (req: AuthedReq, res: express.Response, next: express.NextFunction) => {
    const params = req.params as Record<string, string | undefined>;
    const targetUid = params?.[uidParam];
    if (req.user?.admin || (targetUid && req.user?.uid === targetUid)) {
      next();
      return;
    }
    res.status(403).json({ error: 'Forbidden' });
  };

const requireAdmin = (req: AuthedReq, res: express.Response, next: express.NextFunction) =>
  req.user?.admin ? next() : res.status(403).json({ error: 'Admins only' });

const requireProfileComplete =
  (uidParam = 'uid') => async (req: AuthedReq, res: express.Response, next: express.NextFunction) => {
    if (req.user?.admin) {
      next();
      return;
    }
    try {
      const params = req.params as Record<string, string | undefined>;
      const targetUid = params?.[uidParam] || req.user?.uid;
      if (!targetUid) {
        res.status(400).json({ error: 'PROFILE_LOOKUP_FAILED' });
        return;
      }
      const snap = await db.collection('users').doc(targetUid).get();
      const data = snap.data() ?? {};
      const phone = typeof data.phone === 'string' ? data.phone.trim() : '';
      const roleRequest = typeof data.roleRequest === 'string' ? data.roleRequest.trim() : '';
      if (!phone || !roleRequest) {
        res.status(428).json({ error: 'PROFILE_INCOMPLETE' });
        return;
      }
      next();
    } catch (error) {
      console.error('Profile completeness check failed', error);
      res.status(500).json({ error: 'PROFILE_CHECK_FAILED' });
    }
  };
// ---------- Driver inspections ----------
app.get('/driver-inspections', auth, async (req: AuthedReq, res) => {
  try {
    const driverId = (req.query.driverId as string) || req.user!.uid;
    const limit = Math.min(parseInt((req.query.limit as string) || '20', 10), 100);
    const snap = await db.collection('driver_inspections')
      .where('driverId', '==', driverId)
      .orderBy('createdAt', 'desc')
      .limit(limit).get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch {
    res.status(500).json({ error: 'Failed to list inspections' });
  }
});

app.post('/driver-inspections', auth, async (req: AuthedReq, res) => {
  try {
    const { driverId, vehicleId, odometer, checklist, issues, notes } = req.body || {};
    if (!driverId || !vehicleId) return res.status(400).json({ error: 'driverId and vehicleId are required' });
    const ts = admin.firestore.FieldValue.serverTimestamp();
    const ref = await db.collection('driver_inspections').add({
      driverId, vehicleId,
      odometer: Number(odometer) || 0,
      checklist: checklist || {},
      issues: Array.isArray(issues) ? issues : [],
      notes: notes || '',
      createdAt: ts, updatedAt: ts
    });
    res.status(201).json({ id: ref.id });
  } catch {
    res.status(500).json({ error: 'Failed to create inspection' });
  }
});

// ---------- Customer preferences ----------
app.get('/customers/:uid/preferences', auth, requireSelfOrAdmin(), requireProfileComplete(), async (req, res) => {
  const ref = db.collection('customers').doc(req.params.uid).collection('profile').doc('preferences');
  const doc = await ref.get(); res.json(doc.exists ? doc.data() : {});
});
app.put('/customers/:uid/preferences', auth, requireSelfOrAdmin(), requireProfileComplete(), async (req, res) => {
  await db.collection('customers').doc(req.params.uid).collection('profile').doc('preferences')
    .set({ ...req.body, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  res.json({ ok: true });
});

// ---------- Customer notifications ----------
app.get('/customers/:uid/notifications', auth, requireSelfOrAdmin(), requireProfileComplete(), async (req, res) => {
  const ref = db.collection('customers').doc(req.params.uid).collection('profile').doc('notifications');
  const doc = await ref.get(); res.json(doc.exists ? doc.data() : {});
});
app.put('/customers/:uid/notifications', auth, requireSelfOrAdmin(), requireProfileComplete(), async (req, res) => {
  await db.collection('customers').doc(req.params.uid).collection('profile').doc('notifications')
    .set({ ...req.body, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  res.json({ ok: true });
});

// ---------- Customer documents (metadata + upload target) ----------
app.get('/customers/:uid/documents', auth, requireSelfOrAdmin(), requireProfileComplete(), async (req, res) => {
  const snap = await db.collection('customers').doc(req.params.uid).collection('documents')
    .orderBy('createdAt', 'desc').get();
  res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
});
app.put('/customers/:uid/documents/:docId', auth, requireSelfOrAdmin(), requireProfileComplete(), async (req, res) => {
  await db.collection('customers').doc(req.params.uid).collection('documents').doc(req.params.docId)
    .set({ ...req.body, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  res.json({ ok: true });
});
app.post('/customers/:uid/documents/upload-target', auth, requireSelfOrAdmin(), requireProfileComplete(), async (req, res) => {
  const { filename, contentType } = (req.body as { filename?: string; contentType?: string }) || {};
  if (!filename) return res.status(400).json({ error: 'filename required' });
  const path = `customer_docs/${req.params.uid}/${Date.now()}_${filename}`;
  const [url] = await storage.bucket().file(path).getSignedUrl({
    version: 'v4', action: 'write', expires: Date.now() + 15 * 60 * 1000,
    contentType: contentType || 'application/octet-stream'
  });
  await db.collection('customers').doc(req.params.uid).collection('documents').add({
    path, filename, contentType: contentType || null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  res.json({ uploadUrl: url, storagePath: path, expiresIn: 900 });
});

// ---------- Customer booking actions ----------
app.post('/customers/:uid/bookings/:bookingId/pay-now', auth, requireSelfOrAdmin(), requireProfileComplete(), async (req: AuthedReq, res) => {
  try {
    const { uid, bookingId } = req.params;
    if (!bookingId) {
      res.status(400).json({ error: 'BOOKING_ID_REQUIRED' });
      return;
    }

    const bookingRef = db.collection('bookings').doc(bookingId);
    const snap = await bookingRef.get();
    if (!snap.exists) {
      res.status(404).json({ error: 'BOOKING_NOT_FOUND' });
      return;
    }

    const data = snap.data();
    if (!req.user?.admin && !customerOwnsBooking(data, uid)) {
      res.status(403).json({ error: 'FORBIDDEN' });
      return;
    }

    const payment = (data?.payment as Record<string, unknown>) ?? {};
    const totalCentsRaw = payment.totalCents;
    const totalCents = typeof totalCentsRaw === 'number' && Number.isFinite(totalCentsRaw) ? Math.round(totalCentsRaw) : null;
    if (!totalCents || totalCents <= 0) {
      res.status(400).json({ error: 'TOTAL_UNAVAILABLE' });
      return;
    }

    const existingLink =
      typeof payment.link === 'string' && payment.link.trim().length > 0 ? payment.link.trim() : null;
    const existingOrderId =
      typeof payment.orderId === 'string' && payment.orderId.trim().length > 0 ? payment.orderId : null;

    if (existingLink) {
      res.json({ link: existingLink, orderId: existingOrderId ?? null });
      return;
    }

    const bookingNumber = typeof data?.bookingNumber === 'number' ? data.bookingNumber : null;
    if (!bookingNumber) {
      res.status(400).json({ error: 'BOOKING_NUMBER_MISSING' });
      return;
    }

    const passenger = (data?.passenger as Record<string, unknown>) ?? {};
    const passengerName =
      sanitizeDisplayName(passenger.primaryPassenger) ||
      sanitizeDisplayName((data?.user as { email?: string })?.email) ||
      'Valley Airporter Customer';

    const link = await createSquarePaymentLink({
      amountCents: totalCents,
      bookingId,
      bookingNumber,
      customerName: passengerName,
    });

    const now = admin.firestore.FieldValue.serverTimestamp();
    const historyTimestamp = admin.firestore.Timestamp.now();
    const actor = {
      uid: req.user?.uid ?? uid,
      role: req.user?.admin ? 'admin' : 'customer',
      name: req.user?.email ?? null,
    };

    await bookingRef.set(
      {
        payment: {
          ...payment,
          preference: 'pay_now',
          link: link.url ?? null,
          orderId: link.orderId ?? null,
        },
        updatedAt: now,
        statusHistory: admin.firestore.FieldValue.arrayUnion({
          status: 'payment_link_created',
          timestamp: historyTimestamp,
          actor,
          note: 'Customer generated pay-now link',
        }),
      },
      { merge: true },
    );

    await syncCustomerBooking(bookingId);

    res.json({ link: link.url ?? null, orderId: link.orderId ?? null });
  } catch (error) {
    console.error('Failed to generate pay-now link', error);
    const message = error instanceof Error ? error.message : 'PAY_NOW_FAILED';
    res.status(500).json({ error: message || 'PAY_NOW_FAILED' });
  }
});

app.post('/customers/:uid/bookings/:bookingId/tip-link', auth, requireSelfOrAdmin(), requireProfileComplete(), async (req: AuthedReq, res) => {
  try {
    const { uid, bookingId } = req.params;
    if (!bookingId) {
      res.status(400).json({ error: 'BOOKING_ID_REQUIRED' });
      return;
    }

    const amountCents = parseTipAmountToCents((req.body as { amount?: unknown })?.amount);
    if (!amountCents) {
      res.status(400).json({ error: 'TIP_AMOUNT_INVALID' });
      return;
    }

    const bookingRef = db.collection('bookings').doc(bookingId);
    const snap = await bookingRef.get();
    if (!snap.exists) {
      res.status(404).json({ error: 'BOOKING_NOT_FOUND' });
      return;
    }

    const data = snap.data();
    if (!req.user?.admin && !customerOwnsBooking(data, uid)) {
      res.status(403).json({ error: 'FORBIDDEN' });
      return;
    }

    const bookingNumber = typeof data?.bookingNumber === 'number' ? data.bookingNumber : null;
    if (!bookingNumber) {
      res.status(400).json({ error: 'BOOKING_NUMBER_MISSING' });
      return;
    }

    const passenger = (data?.passenger as Record<string, unknown>) ?? {};
    const passengerName =
      sanitizeDisplayName(passenger.primaryPassenger) ||
      sanitizeDisplayName((data?.user as { email?: string })?.email) ||
      'Valley Airporter Customer';

    const link = await createSquarePaymentLink({
      amountCents,
      bookingId,
      bookingNumber,
      customerName: `TIP ONLY - ${passengerName}`,
    });

    const now = admin.firestore.FieldValue.serverTimestamp();
    const historyTimestamp = admin.firestore.Timestamp.now();
    const actor = {
      uid: req.user?.uid ?? uid,
      role: req.user?.admin ? 'admin' : 'customer',
      name: req.user?.email ?? null,
    };

    await bookingRef.set(
      {
        updatedAt: now,
        statusHistory: admin.firestore.FieldValue.arrayUnion({
          status: 'tip_link_created',
          timestamp: historyTimestamp,
          actor,
          note: `Customer generated tip link for ${(amountCents / 100).toFixed(2)} CAD`,
        }),
        'payment.tipLinks': admin.firestore.FieldValue.arrayUnion({
          amountCents,
          url: link.url ?? null,
          orderId: link.orderId ?? null,
          createdAt: historyTimestamp,
          createdBy: actor,
        }),
      },
      { merge: true },
    );

    await syncCustomerBooking(bookingId);

    res.json({ link: link.url ?? null, orderId: link.orderId ?? null, amountCents });
  } catch (error) {
    console.error('Failed to generate tip link', error);
    const message = error instanceof Error ? error.message : 'TIP_LINK_FAILED';
    res.status(500).json({ error: message || 'TIP_LINK_FAILED' });
  }
});

app.post('/customers/:uid/bookings/:bookingId/cancel', auth, requireSelfOrAdmin(), async (req: AuthedReq, res) => {
  try {
    const { uid, bookingId } = req.params;
    if (!bookingId) {
      res.status(400).json({ error: 'BOOKING_ID_REQUIRED' });
      return;
    }

    const bookingRef = db.collection('bookings').doc(bookingId);
    const snap = await bookingRef.get();
    if (!snap.exists) {
      res.status(404).json({ error: 'BOOKING_NOT_FOUND' });
      return;
    }

    const data = snap.data();
    if (!req.user?.admin && !customerOwnsBooking(data, uid)) {
      res.status(403).json({ error: 'FORBIDDEN' });
      return;
    }

    const currentStatus =
      typeof data?.status === 'string' && data.status.trim().length > 0
        ? (data.status as string)
        : 'pending';

    if (currentStatus === 'cancelled') {
      res.json({ ok: true, status: 'cancelled' });
      return;
    }

    if (currentStatus === 'completed' || !CANCELLABLE_STATUSES.has(currentStatus)) {
      res.status(409).json({ error: 'CANCEL_NOT_ALLOWED', currentStatus });
      return;
    }

    const body = (req.body as { note?: unknown; reasonNote?: unknown }) ?? {};
    const noteRaw = typeof body.note === 'string' ? body.note.trim() : '';
    const reasonNoteRaw = typeof body.reasonNote === 'string' ? body.reasonNote.trim() : '';
    const note = noteRaw || reasonNoteRaw || null;
    const reasonNote = reasonNoteRaw || noteRaw || undefined;

    const actor = {
      uid: req.user?.uid ?? uid,
      role: req.user?.admin ? 'admin' : 'customer',
      name: req.user?.email ?? null,
    };

    await bookingRef.update({
      status: 'cancelled',
      statusHistory: admin.firestore.FieldValue.arrayUnion({
        status: 'cancelled',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        actor,
        note,
        reasonCode: 'customer_request',
        reasonNote: reasonNote ?? null,
      }),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      'system.statusGuardrail': {
        currentStatus: 'cancelled',
        previousStatus: currentStatus,
        reasonCode: 'customer_request',
        reasonNote: reasonNote ?? null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        actor,
      },
    });

    await syncCustomerBooking(bookingId);

    const schedule = (data?.schedule as Record<string, unknown>) ?? {};
    const trip = (data?.trip as Record<string, unknown>) ?? {};
    const passenger = (data?.passenger as Record<string, unknown>) ?? {};
    const assignment = (data?.assignment as Record<string, unknown>) ?? {};
    const pickupTimestamp = schedule.pickupTimestamp;

    let pickupDate: Date | null = null;
    if (pickupTimestamp instanceof admin.firestore.Timestamp) {
      pickupDate = pickupTimestamp.toDate();
    } else if (typeof pickupTimestamp === 'number') {
      pickupDate = new Date(pickupTimestamp);
    }

    const pickupLabel = pickupDate ? pickupDate.toLocaleString() : 'Pickup time pending';
    const routeLabel = `${typeof trip.origin === 'string' ? trip.origin : 'Origin'} → ${
      typeof trip.destination === 'string' ? trip.destination : 'Destination'
    }`;

    let statusEmailId: string | null = null;
    if (typeof passenger.email === 'string' && passenger.email.includes('@')) {
      const passengerName =
        typeof passenger.primaryPassenger === 'string' && passenger.primaryPassenger.trim().length > 0
          ? passenger.primaryPassenger
          : 'there';
      statusEmailId = await queueEmailNotification({
        to: passenger.email,
        subject: 'Ride update · cancelled',
        text: `Hello ${passengerName},\n\nYour booking ${bookingId} is now marked as cancelled.\nPickup: ${pickupLabel}\nRoute: ${routeLabel}${
          reasonNote ? `\nReason: ${reasonNote}` : ''
        }\n\nIf this looks incorrect, please reach out to dispatch.`,
      });
    }

    if (typeof passenger.phone === 'string' && passenger.phone.trim().length > 0) {
      await queueSmsNotification({
        to: passenger.phone,
        message: `Valley Airporter ride update: booking ${bookingId} is now cancelled.${
          reasonNote ? ` Reason: ${reasonNote}` : ''
        }`,
      });
    }

    if (typeof assignment.driverId === 'string' && assignment.driverId.trim().length > 0) {
      await queuePushNotification({
        userId: assignment.driverId,
        title: 'Booking cancelled',
        body: `Booking ${bookingId} has been cancelled.`,
        data: {
          bookingId,
          status: 'cancelled',
        },
      });
    }

    const sentAtField = admin.firestore.FieldValue.serverTimestamp();
    const notificationUpdate: Record<string, unknown> = {
      'system.notifications.statusChange': {
        status: 'cancelled',
        at: sentAtField,
        actor,
        reasonCode: 'customer_request',
        reasonNote: reasonNote ?? null,
        previousStatus: currentStatus,
      },
    };

    if (
      statusEmailId != null ||
      (typeof passenger.email === 'string' && passenger.email.includes('@'))
    ) {
      notificationUpdate['system.notifications.email.statusChange'] = {
        sent: Boolean(statusEmailId || passenger.email),
        at: sentAtField,
        mailId: statusEmailId ?? null,
        to:
          typeof passenger.email === 'string' && passenger.email.includes('@')
            ? [passenger.email]
            : [],
      };
    }

    if (typeof passenger.phone === 'string' && passenger.phone.trim().length > 0) {
      notificationUpdate['system.notifications.sms.statusChange'] = {
        sent: true,
        at: sentAtField,
        to: passenger.phone,
      };
    }

    if (typeof assignment.driverId === 'string' && assignment.driverId.trim().length > 0) {
      notificationUpdate['system.notifications.push.statusChange'] = {
        sent: true,
        at: sentAtField,
        target: assignment.driverId,
      };
    }

    await bookingRef.set(notificationUpdate, { merge: true });

    res.json({ ok: true, status: 'cancelled' });
  } catch (error) {
    console.error('Failed to cancel booking', error);
    const message = error instanceof Error ? error.message : 'CANCEL_FAILED';
    res.status(500).json({ error: message || 'CANCEL_FAILED' });
  }
});

// ---------- Admin alerts matrix ----------
app.get('/admin/alerts/settings', auth, requireAdmin, async (_req, res) => {
  const ref = db.collection('admin').doc('config').collection('settings').doc('alerts');
  const doc = await ref.get(); res.json(doc.exists ? doc.data() : {});
});
app.put('/admin/alerts/settings', auth, requireAdmin, async (req, res) => {
  await db.collection('admin').doc('config').collection('settings').doc('alerts')
    .set({ ...req.body, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  res.json({ ok: true });
});

// ---------- Admin role endpoint (with bootstrap email backdoor) ----------
app.post('/admin/users/:uid/role', auth, async (req: AuthedReq, res) => {
  const { uid } = req.params;
  const { admin: wantAdmin } = (req.body || {}) as { admin?: boolean };
  if (typeof wantAdmin === 'undefined') return res.status(400).json({ error: 'admin boolean required' });

  const bootstrapEmail = BOOTSTRAP_ADMIN_EMAIL.value()?.toLowerCase();
  const callerEmail = req.user?.email?.toLowerCase();
  const callerIsBootstrap = !!bootstrapEmail && callerEmail === bootstrapEmail;

  if (!req.user?.admin && !callerIsBootstrap) return res.status(403).json({ error: 'Admins only' });

  const user = await admin.auth().getUser(uid);
  const current = user.customClaims || {};
  await admin.auth().setCustomUserClaims(uid, { ...current, admin: !!wantAdmin });
  res.json({ ok: true, uid, admin: !!wantAdmin });
});

app.post('/pricing/createQuote', optionalAuth, async (req: AuthedReq, res) => {
  try {
    const {
      direction,
      origin,
      destination,
      passengerCount,
      preferredVehicle,
      originAddress,
      destinationAddress,
      originLat,
      originLng,
      destinationLat,
      destinationLng,
      originPlaceId,
      destinationPlaceId,
      sessionId,
    } = (req.body || {}) as {
      direction?: TripDirection;
      origin?: string;
      destination?: string;
      passengerCount?: number;
      preferredVehicle?: 'standard' | 'van';
      originAddress?: string | null;
      destinationAddress?: string | null;
      originLat?: number | null;
      originLng?: number | null;
      destinationLat?: number | null;
      destinationLng?: number | null;
      originPlaceId?: string | null;
      destinationPlaceId?: string | null;
      sessionId?: string | null;
    };

    if (!direction || !origin || !destination || !passengerCount) {
      return res.status(400).json({ error: 'INVALID_QUOTE_INPUT' });
    }

    const result = await createQuote({
      direction,
      origin,
      destination,
      passengerCount,
      preferredVehicle,
      originAddress,
      destinationAddress,
      originLat,
      originLng,
      destinationLat,
      destinationLng,
      originPlaceId,
      destinationPlaceId,
      sessionId,
      user: {
        uid: req.user?.uid ?? null,
        anonymous: req.user?.anonymous ?? false,
      },
    });

    res.status(201).json(serializeQuoteResponse(result.id, result.doc));
  } catch (error) {
    if (error instanceof PricingError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error('pricing.createQuote failed', error);
    res.status(500).json({ error: 'QUOTE_CREATE_FAILED' });
  }
});

app.get('/quotes/:quoteId', optionalAuth, async (req: AuthedReq, res) => {
  try {
    const quoteId = req.params.quoteId;
    if (!quoteId) {
      return res.status(400).json({ error: 'MISSING_QUOTE_ID' });
    }
    const sessionId = typeof req.query.sessionId === 'string' ? (req.query.sessionId as string) : null;
    const result = await getQuote({
      quoteId,
      sessionId,
      user: req.user ?? null,
    });
    res.json(result);
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      const status = (error as { status?: number }).status ?? 500;
      res.status(status).json({ error: error.message });
      return;
    }
    console.error('quotes.get failed', error);
    res.status(500).json({ error: 'QUOTE_FETCH_FAILED' });
  }
});

app.post('/pricing/updateQuote', optionalAuth, async (req: AuthedReq, res) => {
  try {
    const { quoteId, patch, sessionId } = (req.body || {}) as {
      quoteId?: string;
      sessionId?: string | null;
      patch?: unknown;
    };
    if (!quoteId || typeof patch !== 'object' || patch === null) {
      return res.status(400).json({ error: 'INVALID_UPDATE_INPUT' });
    }

    const result = await updateQuote({
      quoteId,
      sessionId: sessionId ?? null,
      patch: patch as Parameters<typeof updateQuote>[0]['patch'],
      user: req.user ?? null,
    });
    res.json(result);
  } catch (error) {
    if (error instanceof PricingError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    if (error instanceof Error && "status" in error) {
      const status = (error as { status?: number }).status ?? 500;
      res.status(status).json({ error: error.message });
      return;
    }
    console.error('pricing.updateQuote failed', error);
    res.status(500).json({ error: 'QUOTE_UPDATE_FAILED' });
  }
});

app.post('/quotes/attachContact', optionalAuth, async (req: AuthedReq, res) => {
  try {
    const { quoteId, contact, sessionId } = (req.body || {}) as {
      quoteId?: string;
      sessionId?: string | null;
      contact?: {
        fullName?: string;
        email?: string;
        phone?: string;
      };
    };
    if (!quoteId || !contact?.fullName || !contact?.email || !contact?.phone) {
      return res.status(400).json({ error: 'INVALID_CONTACT_INPUT' });
    }

    const result = await attachContact({
      quoteId,
      sessionId: sessionId ?? null,
      user: req.user ?? null,
      contact: {
        fullName: contact.fullName,
        email: contact.email,
        phone: contact.phone,
      },
    });
    res.json(result);
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      const status = (error as { status?: number }).status ?? 500;
      res.status(status).json({ error: error.message });
      return;
    }
    console.error('quotes.attachContact failed', error);
    res.status(500).json({ error: 'ATTACH_CONTACT_FAILED' });
  }
});

app.post('/booking/confirm', optionalAuth, async (req: AuthedReq, res) => {
  try {
    const { quoteId, schedule, passenger, payment, sessionId } = (req.body || {}) as {
      quoteId?: string;
      sessionId?: string | null;
      schedule?: {
        pickupDate?: string;
        pickupTime?: string;
        flightNumber?: string | null;
        notes?: string | null;
      };
      passenger?: {
        fullName?: string;
        email?: string;
        phone?: string;
        baggage?: string | null;
      };
      payment?: {
        preference?: 'pay_on_arrival' | 'pay_now';
        tipAmount?: number;
      };
    };

    if (
      !quoteId ||
      !schedule?.pickupDate ||
      !schedule.pickupTime ||
      !passenger?.fullName ||
      !passenger.email ||
      !passenger.phone ||
      !payment?.preference
    ) {
      return res.status(400).json({ error: 'INVALID_CONFIRM_INPUT' });
    }

    const result = await confirmQuote({
      quoteId,
      sessionId: sessionId ?? null,
      user: req.user ?? null,
      schedule: {
        pickupDate: schedule.pickupDate,
        pickupTime: schedule.pickupTime,
        flightNumber: schedule.flightNumber ?? null,
        notes: schedule.notes ?? null,
      },
      passenger: {
        fullName: passenger.fullName,
        email: passenger.email,
        phone: passenger.phone,
        baggage: passenger.baggage ?? null,
      },
      payment: {
        preference: payment.preference,
        tipAmount: payment.tipAmount ?? 0,
      },
    });

    res.json(result);
  } catch (error) {
    if (error instanceof PricingError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    if (error instanceof Error && "status" in error) {
      const status = (error as { status?: number }).status ?? 500;
      res.status(status).json({ error: error.message });
      return;
    }
    console.error('booking.confirm failed', error);
    res.status(500).json({ error: 'BOOKING_CONFIRM_FAILED' });
  }
});

app.post('/fares/quote', async (req, res) => {
  try {
    const {
      direction,
      origin,
      destination,
      passengerCount,
      preferredVehicle,
      originAddress,
      destinationAddress,
      originLat,
      originLng,
      destinationLat,
      destinationLng,
      originPlaceId,
      destinationPlaceId,
      passenger,
      pickupDate,
      pickupTime,
      suppressLog,
    } = (req.body || {}) as {
      direction?: TripDirection;
      origin?: string;
      destination?: string;
      passengerCount?: number;
      preferredVehicle?: "standard" | "van";
      originAddress?: string | null;
      destinationAddress?: string | null;
      originLat?: number | null;
      originLng?: number | null;
      destinationLat?: number | null;
      destinationLng?: number | null;
      originPlaceId?: string | null;
      destinationPlaceId?: string | null;
      pickupDate?: string | null;
      pickupTime?: string | null;
      passenger?: {
        primaryPassenger?: string | null;
        email?: string | null;
        phone?: string | null;
      };
      suppressLog?: boolean;
    };

    const authedReq = req as AuthedReq;

    if (!direction || !origin || !destination) {
      return res.status(400).json({ error: 'INVALID_ROUTE' });
    }

    const pax = Number(passengerCount);
    if (!Number.isFinite(pax) || pax < 1) {
      return res.status(400).json({ error: 'INVALID_PASSENGER_COUNT' });
    }

    const originDetails = resolveLocationDetails({
      label: origin,
      address: originAddress ?? null,
      lat: typeof originLat === 'number' ? originLat : null,
      lng: typeof originLng === 'number' ? originLng : null,
      placeId: originPlaceId ?? null,
    });
    const destinationDetails = resolveLocationDetails({
      label: destination,
      address: destinationAddress ?? null,
      lat: typeof destinationLat === 'number' ? destinationLat : null,
      lng: typeof destinationLng === 'number' ? destinationLng : null,
      placeId: destinationPlaceId ?? null,
    });

    const pricing = await calculatePricing({
      direction,
      origin,
      destination,
      passengerCount: pax,
      preferredVehicle,
      originAddress: originDetails.address,
      destinationAddress: destinationDetails.address,
      originLatLng:
        typeof originDetails.lat === 'number' && typeof originDetails.lng === 'number'
          ? { lat: originDetails.lat, lng: originDetails.lng }
          : null,
      destinationLatLng:
        typeof destinationDetails.lat === 'number' && typeof destinationDetails.lng === 'number'
          ? { lat: destinationDetails.lat, lng: destinationDetails.lng }
          : null,
    });

    const contact = {
      name:
        typeof passenger?.primaryPassenger === 'string' && passenger.primaryPassenger.trim().length > 0
          ? passenger.primaryPassenger.trim()
          : null,
      email:
        typeof passenger?.email === 'string' && passenger.email.trim().length > 0
          ? passenger.email.trim().toLowerCase()
          : null,
      phone:
        typeof passenger?.phone === 'string' && passenger.phone.trim().length > 0
          ? passenger.phone.trim()
          : null,
    };

    const quoteLogBase = {
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      direction,
      origin,
      originAddress: originDetails.address ?? null,
      destination,
      destinationAddress: destinationDetails.address ?? null,
      passengers: pax,
      contact,
      quote: pricing.baseRate ? Math.round(pricing.baseRate) : null,
      status: pricing.baseRate ? 'success' : 'no_price',
      user: authedReq.user ?? null,
      pickupDate:
        typeof pickupDate === 'string' && pickupDate.trim().length > 0 ? pickupDate.trim() : null,
      pickupTime:
        typeof pickupTime === 'string' && pickupTime.trim().length > 0 ? pickupTime.trim() : null,
      ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.socket.remoteAddress ?? null,
    };

    const skipLogging = suppressLog === true;

    if (!pricing.baseRate) {
      if (!skipLogging) {
        await db.collection('quoteLogs').add(quoteLogBase);
      }
      return res.status(404).json({ error: 'NO_PRICE_AVAILABLE', pricing });
    }

    if (!skipLogging) {
      await db.collection('quoteLogs').add(quoteLogBase);
    }

    res.json(pricing);
  } catch (error) {
    if (error instanceof PricingError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'QUOTE_FAILED' });
  }
});

app.post('/quoteLogs', optionalAuth, async (req: AuthedReq, res) => {
  try {
    const { trip = {}, quote = {}, schedule = {}, contact = {}, lastStep } = (req.body || {}) as Record<string, unknown>;

    const tripData = trip as Record<string, unknown>;
    const direction = sanitizeStringField(tripData.direction);
    const origin = sanitizeStringField(tripData.origin);
    const destination = sanitizeStringField(tripData.destination);

    if (!direction || !origin || !destination) {
      res.status(400).json({ error: 'INVALID_TRIP' });
      return;
    }

    const passengers =
      sanitizeOptionalNumber(tripData.passengers) ??
      sanitizeOptionalNumber((tripData as { passengerCount?: unknown }).passengerCount);
    const preferredVehicle = sanitizeStringField(tripData.preferredVehicle);

    const quoteData = quote as Record<string, unknown>;
    const amount = sanitizeOptionalNumber(quoteData.amount);
    const quoteBreakdown =
      amount != null
        ? {
            baseFare: sanitizeOptionalNumber(quoteData.baseFare),
            extraPassengers: sanitizeOptionalNumber(quoteData.extraPassengers),
            extraPassengerTotal: sanitizeOptionalNumber(quoteData.extraPassengerTotal),
            estimatedGst: sanitizeOptionalNumber(quoteData.estimatedGst),
            perPassenger: sanitizeOptionalNumber(quoteData.perPassenger),
          }
        : null;

    const scheduleSanitized = sanitizeSchedulePayload(schedule);
    const contactSanitized = sanitizeContactPayload(contact);

    const docData: admin.firestore.DocumentData = {
      direction,
      origin,
      originAddress: sanitizeStringField(tripData.originAddress),
      destination,
      destinationAddress: sanitizeStringField(tripData.destinationAddress),
      passengers: passengers ?? null,
      vehicleSelections: sanitizeVehicleSelections(tripData.vehicleSelections),
      preferredVehicle: preferredVehicle ?? null,
      status: sanitizeStringField(tripData.status) ?? (amount != null ? 'success' : 'pending'),
      quote: amount != null ? Math.round(amount) : null,
      quoteBreakdown,
      contact: contactSanitized,
      pickupDate: scheduleSanitized.pickupDate,
      pickupTime: scheduleSanitized.pickupTime,
      flightNumber: scheduleSanitized.flightNumber,
      notes: scheduleSanitized.notes,
      lastStep: typeof lastStep === 'number' ? lastStep : 2,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ip: getClientIp(req),
      user: req.user
        ? {
            uid: req.user.uid,
            email: req.user.email ?? null,
          }
        : null,
    };

    const ref = await db.collection('quoteLogs').add(docData);
    res.status(201).json({ id: ref.id });
  } catch (error) {
    console.error('quoteLogs:create failed', error);
    res.status(500).json({ error: 'QUOTE_LOG_CREATE_FAILED' });
  }
});

app.patch('/quoteLogs/:logId', optionalAuth, async (req: AuthedReq, res) => {
  try {
    const { logId } = req.params as { logId?: string };
    if (!logId) {
      res.status(400).json({ error: 'INVALID_LOG_ID' });
      return;
    }

    const { trip, quote, schedule, contact, lastStep, booking } = (req.body || {}) as Record<string, unknown>;

    const updates: admin.firestore.UpdateData<admin.firestore.DocumentData> = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (trip && typeof trip === 'object') {
      const tripData = trip as Record<string, unknown>;
      const direction = sanitizeStringField(tripData.direction);
      const origin = sanitizeStringField(tripData.origin);
      const destination = sanitizeStringField(tripData.destination);
      if (direction) updates.direction = direction;
      if (origin) updates.origin = origin;
      if (tripData.originAddress !== undefined) {
        updates.originAddress = sanitizeStringField(tripData.originAddress);
      }
      if (destination) updates.destination = destination;
      if (tripData.destinationAddress !== undefined) {
        updates.destinationAddress = sanitizeStringField(tripData.destinationAddress);
      }
      if (tripData.passengers !== undefined) {
        updates.passengers = sanitizeOptionalNumber(tripData.passengers);
      }
      if (tripData.vehicleSelections !== undefined) {
        updates.vehicleSelections = sanitizeVehicleSelections(tripData.vehicleSelections);
      }
      if (tripData.preferredVehicle !== undefined) {
        updates.preferredVehicle = sanitizeStringField(tripData.preferredVehicle);
      }
      if (tripData.status !== undefined) {
        updates.status = sanitizeStringField(tripData.status);
      }
    }

    if (quote && typeof quote === 'object') {
      const quoteData = quote as Record<string, unknown>;
      const amount = sanitizeOptionalNumber(quoteData.amount);
      updates.quote = amount != null ? Math.round(amount) : null;
      updates.quoteBreakdown =
        amount != null
          ? {
              baseFare: sanitizeOptionalNumber(quoteData.baseFare),
              extraPassengers: sanitizeOptionalNumber(quoteData.extraPassengers),
              extraPassengerTotal: sanitizeOptionalNumber(quoteData.extraPassengerTotal),
              estimatedGst: sanitizeOptionalNumber(quoteData.estimatedGst),
              perPassenger: sanitizeOptionalNumber(quoteData.perPassenger),
            }
          : null;
    }

    if (schedule !== undefined) {
      const scheduleSanitized = sanitizeSchedulePayload(schedule);
      updates.pickupDate = scheduleSanitized.pickupDate;
      updates.pickupTime = scheduleSanitized.pickupTime;
      updates.flightNumber = scheduleSanitized.flightNumber;
      updates.notes = scheduleSanitized.notes;
    }

    if (contact !== undefined) {
      updates.contact = sanitizeContactPayload(contact);
    }

    if (typeof lastStep === 'number') {
      updates.lastStep = lastStep;
    }

    if (booking && typeof booking === 'object') {
      const bookingData = booking as Record<string, unknown>;
      updates.booking = {
        id: sanitizeStringField(bookingData.id),
        paymentPreference: sanitizeStringField(bookingData.paymentPreference),
        paymentLink: sanitizeStringField(bookingData.paymentLink),
        tipAmount: sanitizeOptionalNumber(bookingData.tipAmount),
      };
    }

    await db.collection('quoteLogs').doc(logId).set(updates, { merge: true });
    res.json({ ok: true });
  } catch (error) {
    console.error('quoteLogs:update failed', error);
    res.status(500).json({ error: 'QUOTE_LOG_UPDATE_FAILED' });
  }
});

// Example: const squareToken = SQUARE_ACCESS_TOKEN.value();
export const api = onRequest(
  { region: 'us-central1', cors: true, secrets: [SQUARE_ACCESS_TOKEN, BOOTSTRAP_ADMIN_EMAIL, MAPS_SERVER_KEY] },
  app
);
