// functions/src/squareListLocations.ts
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { requireUser } from "./_auth";

// use the same secret name you set earlier:
const VALLEY_SQUARE_ACCESS_TOKEN = defineSecret("VALLEY_SQUARE_ACCESS_TOKEN");

export const squareListLocations = onRequest(
  // public invoker is fine because we verify Firebase ID token ourselves
  { region: "us-central1", invoker: "public", secrets: [VALLEY_SQUARE_ACCESS_TOKEN] },
  async (req, res) => {
    if (req.method !== "GET") { res.status(405).json({ ok:false, error:"GET only" }); return; }

    const user = await requireUser(
      req as unknown as ExpressRequest,
      res as unknown as ExpressResponse,
    );  // 401s if not signed in
    if (!user) return;

    const r = await fetch("https://connect.squareup.com/v2/locations", {
      headers: {
        "Authorization": `Bearer ${VALLEY_SQUARE_ACCESS_TOKEN.value()}`,
        "Square-Version": "2024-08-21"
      }
    });

    const json = await r.json();
    res.status(r.status).json(json);
  }
);
