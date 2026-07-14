// MongoDB credential + identity store. Holds one document per account (seller / buyer / admin):
// email, scrypt password hash, name, role. Auth routes verify here, then find-or-create the matching
// app-repo User (keyed by sub `email|<email>`) so the rest of the app is unchanged. Node runtime only
// (the driver has no edge build); never imported by middleware.ts.
import crypto from "crypto";
import { MongoClient, type Collection } from "mongodb";
import type { Role } from "./db/types";

export interface AccountDoc {
  email: string;        // unique, lowercased — the login id
  passwordHash: string; // scrypt(password, salt) hex
  salt: string;         // per-account random salt, hex
  name: string;
  role: Role;
  createdAt: string;
}

const URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || "asli";

// Cache the client+connect promise on globalThis so Next.js dev HMR and serverless warm invocations
// reuse one connection pool instead of opening a new one per module reload.
const g = globalThis as unknown as { __asliMongo?: Promise<Collection<AccountDoc>> };

/** The `accounts` collection, connecting (once) and ensuring the unique email index on first use. */
export function accounts(): Promise<Collection<AccountDoc>> {
  if (!URI) throw new Error("MONGODB_URI is not set — add it to web/.env.local.");
  if (!g.__asliMongo) {
    g.__asliMongo = new MongoClient(URI).connect().then(async (client) => {
      const col = client.db(DB_NAME).collection<AccountDoc>("accounts");
      await col.createIndex({ email: 1 }, { unique: true });
      return col;
    });
  }
  return g.__asliMongo;
}

/** Normalize an email for use as a stable key (login id + session subject). */
export const normEmail = (email: string) => email.trim().toLowerCase();

/** Hash a password with a fresh random salt (scrypt — no extra dependency). */
export function hashPassword(password: string): { passwordHash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { passwordHash, salt };
}

/** Timing-safe verify of a password against a stored hash+salt. */
export function verifyPassword(password: string, doc: Pick<AccountDoc, "passwordHash" | "salt">): boolean {
  const hash = crypto.scryptSync(password, doc.salt, 64);
  const stored = Buffer.from(doc.passwordHash, "hex");
  return hash.length === stored.length && crypto.timingSafeEqual(hash, stored);
}
