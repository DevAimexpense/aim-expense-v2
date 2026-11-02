// ===========================================
// Aim Expense — Token Encryption
// Encrypt/Decrypt Google OAuth tokens ก่อนเก็บ DB
// ใช้ AES-256-GCM
// ===========================================

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/** Prefix ของ ciphertext รุ่นปัจจุบัน — ค่าเก่าในฐานข้อมูลไม่มี prefix (legacy) ยังถอดได้ */
const VERSION_PREFIX = "v1:";

function parseKey(hex: string, name: string): Buffer {
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error(`${name} must be 32 bytes (64 hex characters)`);
  }
  return key;
}

/**
 * Get encryption key from env
 * ต้องเป็น 32 bytes (64 hex characters)
 */
function getEncryptionKey(): Buffer {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("TOKEN_ENCRYPTION_KEY is not set");
  }
  return parseKey(key, "TOKEN_ENCRYPTION_KEY");
}

/**
 * CO-08: หมุน key ได้โดยไม่ต้อง re-encrypt ทั้งตาราง — ตั้ง key เดิมไว้ที่
 * TOKEN_ENCRYPTION_KEY_PREV แล้ว decrypt จะลอง key ปัจจุบันก่อน ตกไปลอง key เดิม
 * (token ที่เขียนใหม่/refresh จะถูก encrypt ด้วย key ปัจจุบันเองทีละตัว)
 */
function getPreviousEncryptionKey(): Buffer | null {
  const key = process.env.TOKEN_ENCRYPTION_KEY_PREV;
  return key ? parseKey(key, "TOKEN_ENCRYPTION_KEY_PREV") : null;
}

/**
 * Encrypt a string (e.g., refresh_token)
 * Returns: v1:iv:authTag:encryptedData (base64)
 */
export function encryptToken(plainText: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plainText, "utf8", "base64");
  encrypted += cipher.final("base64");

  const authTag = cipher.getAuthTag();

  // Format: v1:iv:authTag:encrypted (all base64)
  return (
    VERSION_PREFIX +
    [iv.toString("base64"), authTag.toString("base64"), encrypted].join(":")
  );
}

function decryptWithKey(
  key: Buffer,
  iv: Buffer,
  authTag: Buffer,
  encrypted: string,
): string {
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * Decrypt a token string — รับทั้ง "v1:iv:tag:data" และ "iv:tag:data" (legacy, ไม่มี prefix)
 */
export function decryptToken(encryptedString: string): string {
  const body = encryptedString.startsWith(VERSION_PREFIX)
    ? encryptedString.slice(VERSION_PREFIX.length)
    : encryptedString;
  const [ivBase64, authTagBase64, encrypted] = body.split(":");

  if (!ivBase64 || !authTagBase64 || !encrypted) {
    throw new Error("Invalid encrypted token format");
  }

  const iv = Buffer.from(ivBase64, "base64");
  const authTag = Buffer.from(authTagBase64, "base64");

  try {
    return decryptWithKey(getEncryptionKey(), iv, authTag, encrypted);
  } catch (err) {
    // GCM auth tag ไม่ตรง = คนละ key → ลอง key เดิม (ถ้าตั้งไว้)
    const prev = getPreviousEncryptionKey();
    if (!prev) throw err;
    return decryptWithKey(prev, iv, authTag, encrypted);
  }
}
