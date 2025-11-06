import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import * as admin from "firebase-admin";
import { queueEmailNotification } from "./notifications";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const DISPATCH_EMAIL = process.env.DISPATCH_EMAIL ?? "info@valleyairporter.ca";

const isEmail = (value: string) => /^\S+@\S+\.\S+$/.test(value);
const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });

export const submitContactMessage = onRequest(
  {
    cors: true,
    invoker: "public",
    region: "us-central1",
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
      return;
    }

    try {
      const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const { fullName, email, phone, subject, message } = (payload ?? {}) as Record<string, unknown>;

      const trimmed = {
        fullName: typeof fullName === "string" ? fullName.trim() : "",
        email: typeof email === "string" ? email.trim() : "",
        phone: typeof phone === "string" ? phone.trim() : "",
        subject: typeof subject === "string" ? subject.trim() : "",
        message: typeof message === "string" ? message.trim() : "",
      };

      if (trimmed.fullName.length < 2) {
        res.status(400).json({ error: "Enter your name" });
        return;
      }

      if (!isEmail(trimmed.email)) {
        res.status(400).json({ error: "Enter a valid email" });
        return;
      }

      if (trimmed.phone.length < 7) {
        res.status(400).json({ error: "Enter your phone number" });
        return;
      }

      if (trimmed.subject.length < 3) {
        res.status(400).json({ error: "Describe your request" });
        return;
      }

      if (trimmed.message.length < 10) {
        res.status(400).json({ error: "Share a few details so we can help" });
        return;
      }

      const docRef = await db.collection("contactMessages").add({
        fullName: trimmed.fullName,
        email: trimmed.email.toLowerCase(),
        phone: trimmed.phone,
        subject: trimmed.subject,
        message: trimmed.message,
        status: "new",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        userAgent: req.get("user-agent") ?? null,
        referer: req.get("referer") ?? null,
      });

      if (DISPATCH_EMAIL) {
        const subjectLine = `New contact message: ${trimmed.subject}`;
        const textBody = [
          `You have a new contact request from ${trimmed.fullName}.`,
          ``,
          `Email: ${trimmed.email}`,
          `Phone: ${trimmed.phone}`,
          ``,
          `Subject: ${trimmed.subject}`,
          ``,
          trimmed.message,
          ``,
          `Reference ID: ${docRef.id}`,
        ].join("\n");

        const htmlBody = [
          `<p>You have a new contact request from <strong>${escapeHtml(trimmed.fullName)}</strong>.</p>`,
          `<p><strong>Email:</strong> ${escapeHtml(trimmed.email)}<br/><strong>Phone:</strong> ${escapeHtml(
            trimmed.phone,
          )}</p>`,
          `<p><strong>Subject:</strong> ${escapeHtml(trimmed.subject)}</p>`,
          `<p>${escapeHtml(trimmed.message).replace(/\n/g, "<br/>")}</p>`,
          `<p><em>Reference ID:</em> ${docRef.id}</p>`,
        ].join("");

        await queueEmailNotification({
          to: DISPATCH_EMAIL,
          subject: subjectLine,
          text: textBody,
          html: htmlBody,
          replyTo: trimmed.email,
        });
      } else {
        logger.warn("DISPATCH_EMAIL not configured; skipping contact notification", { id: docRef.id });
      }

      logger.info("contactMessage.created", { id: docRef.id, email });
      res.json({ ok: true, id: docRef.id });
    } catch (error) {
      logger.error("submitContactMessage error", error);
      res
        .status(500)
        .json({ error: "Unable to submit your message right now. Please try again shortly." });
    }
  },
);
