// Dynamic, time-bound challenge codes (invariant #3).
// Fresh code per session, short TTL. Seller writes it on a slip and photographs
// the product next to it. Never hardcode or reuse codes.

import crypto from "crypto";

const TTL_SECONDS = Number(process.env.CHALLENGE_TTL_SECONDS ?? 300);

// No ambiguous chars (0/O, 1/I) — must be hand-writeable and readable by the VLM.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export interface Challenge {
  code: string;
  issuedAt: number; // epoch ms
  expiresAt: number; // epoch ms
}

/** Generate a fresh 4-char code tied to a timestamp (short = easy to hand-write). */
export function issueChallenge(): Challenge {
  const bytes = crypto.randomBytes(4);
  const code = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
  const now = Date.now();
  return { code, issuedAt: now, expiresAt: now + TTL_SECONDS * 1000 };
}

export function isExpired(c: Challenge, now = Date.now()): boolean {
  return now > c.expiresAt;
}
