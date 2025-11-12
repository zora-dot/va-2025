// node delete-bookings-by-email.js "Zora.randhawa@outlook.com"
const admin = require("firebase-admin");
const email = (process.argv[2] || "").trim();
if (!email) {
  console.error('Usage: node delete-bookings-by-email.js "email@example.com"');
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();

(async () => {
  const CHUNK = 400;                 // safe under 500-op batch limit
  let total = 0, last = null;
  while (true) {
    let q = db.collection("bookings")
      .where("user.email", "==", email)
      .orderBy("__name__")
      .limit(CHUNK);
    if (last) q = q.startAfter(last);

    const snap = await q.get();
    if (snap.empty) break;

    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();

    total += snap.size;
    last = snap.docs[snap.docs.length - 1];
    console.log(`Deleted ${total}…`);
  }
  console.log(`Done. Deleted ${total} document(s).`);
})();
