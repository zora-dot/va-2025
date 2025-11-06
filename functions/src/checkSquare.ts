import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";

const VALLEY_SQUARE_ACCESS_TOKEN = defineSecret("VALLEY_SQUARE_ACCESS_TOKEN"); // or your secret name

export const checkSquare = onRequest(
  { region: "us-central1", invoker: "public", secrets: [VALLEY_SQUARE_ACCESS_TOKEN] },
  async (_req, res) => {
    const token = VALLEY_SQUARE_ACCESS_TOKEN.value();
    res.status(200).json({ ok: !!token, length: token ? token.length : 0 });
  }
);
