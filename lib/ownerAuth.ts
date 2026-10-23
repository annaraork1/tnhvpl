import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 32;

export function newSalt(): string {
  return randomBytes(16).toString("base64url");
}

export function hashOwnerPin(pin: string, salt: string): string {
  const buf = scryptSync(pin, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return buf.toString("base64url");
}

export function verifyOwnerPin(pin: string, salt: string, pinHash: string): boolean {
  try {
    const got = scryptSync(pin, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
    const expected = Buffer.from(pinHash, "base64url");
    if (expected.length !== got.length) return false;
    return timingSafeEqual(got, expected);
  } catch {
    return false;
  }
}
