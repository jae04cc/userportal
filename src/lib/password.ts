import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

const KEYLEN = 64;
const SALT_BYTES = 16;

/**
 * scrypt via node:crypto — no native module to compile, unlike bcrypt/argon2.
 * Stored as `salt:hash`, both hex.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES).toString("hex");
  const derived = (await scryptAsync(password, salt, KEYLEN)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;

  const hashBuf = Buffer.from(hash, "hex");
  if (hashBuf.length !== KEYLEN) return false;

  const derived = (await scryptAsync(password, salt, KEYLEN)) as Buffer;
  // Constant-time compare so a wrong password can't be narrowed down by timing
  return timingSafeEqual(hashBuf, derived);
}

/** Used for the bootstrap admin account printed to stdout at first startup. */
export function generateRandomPassword(): string {
  return randomBytes(12).toString("base64url");
}
