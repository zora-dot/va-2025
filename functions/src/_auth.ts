// functions/src/_auth.ts
import * as admin from "firebase-admin";
// ⬇️ use Express types (not from firebase-functions)
import type { Request, Response } from "express";
import type { DecodedIdToken } from "firebase-admin/auth";

if (!admin.apps.length) admin.initializeApp();

export async function requireUser(req: Request, res: Response) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer (.+)$/);
  if (!m) { res.status(401).json({ ok:false, error:"Missing Authorization: Bearer <token>" }); return null; }
  try {
    return await admin.auth().verifyIdToken(m[1]);
  } catch {
    res.status(401).json({ ok:false, error:"Invalid token" });
    return null;
  }
}

export async function getOptionalUser(req: Request): Promise<DecodedIdToken | null> {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer (.+)$/);
  if (!m) return null;
  try {
    return await admin.auth().verifyIdToken(m[1]);
  } catch {
    return null;
  }
}
