import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

const VALID_ROLES = new Set(["admin", "driver", "customer"]);

const normalizeRole = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  if (!VALID_ROLES.has(trimmed)) return null;
  return trimmed;
};

const deriveDesiredRoles = (data: FirebaseFirestore.DocumentData | undefined): string[] => {
  const roles = new Set<string>(["customer"]);
  if (data) {
    const single = normalizeRole(data.role);
    if (single) roles.add(single);
    const multi = Array.isArray(data.roles) ? data.roles : [];
    for (const entry of multi) {
      const normalized = normalizeRole(entry);
      if (normalized) roles.add(normalized);
    }
  }
  return Array.from(roles);
};

const arraysEqual = (a: string[], b: string[]) => {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
};

export const syncUserRoles = onDocumentWritten(
  {
    document: "users/{uid}",
    region: "us-central1",
  },
  async (event) => {
    const uid = event.params.uid;
    if (!uid) return;

    const desiredRoles = deriveDesiredRoles(event.data?.after?.data()).sort();

    try {
      const userRecord = await admin.auth().getUser(uid);
      const currentClaims = userRecord.customClaims ?? {};
      const currentRolesClaim = Array.isArray(currentClaims.roles)
        ? (currentClaims.roles as unknown[]).filter((role): role is string => typeof role === "string")
        : [];
      const normalizedCurrentRoles = Array.from(new Set(currentRolesClaim.map((role) => role.trim().toLowerCase()))).filter(
        (role) => VALID_ROLES.has(role) || role === "customer",
      );
      if (!normalizedCurrentRoles.includes("customer")) {
        normalizedCurrentRoles.push("customer");
      }
      normalizedCurrentRoles.sort();

      if (arraysEqual(desiredRoles, normalizedCurrentRoles)) {
        return;
      }

      const isAdmin = desiredRoles.includes("admin");
      await admin.auth().setCustomUserClaims(uid, {
        ...currentClaims,
        roles: desiredRoles,
        admin: isAdmin || currentClaims.admin === true,
        role: isAdmin ? "admin" : currentClaims.role ?? null,
      });
    } catch (error) {
      if ((error as { code?: string }).code === "auth/user-not-found") {
        console.warn("syncUserRoles: user not found", { uid });
        return;
      }
      console.error("syncUserRoles failed", { uid, error });
    }
  },
);
