import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

/** Short, URL-safe, time-sortable id: prefix + 26 base32 chars (ULID-like). */
export function newId(prefix: "upl" | "job" | "sig" | "rep" | "shr" | "fb"): string {
  const t = Date.now();
  let time = "";
  let n = t;
  for (let i = 0; i < 10; i++) { time = ALPHABET[n % 32] + time; n = Math.floor(n / 32); }
  const rnd = randomBytes(16);
  let rand = "";
  for (let i = 0; i < 16; i++) rand += ALPHABET[rnd[i] % 32];
  return `${prefix}_${time}${rand}`;
}
