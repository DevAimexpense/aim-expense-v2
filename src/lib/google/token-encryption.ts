// ===========================================
// Aim Expense — Token Encryption
// Encrypt/Decrypt Google OAuth tokens ก่อนเก็บ DB
// ใช้ AES-256-GCM
// ===========================================

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Get encryption key from env
 * ต้องเป็น 32 bytes (64 hex characters)
 */
function getEncryptionKey(): Buffer {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("TOKEN_ENCRYPTION_KEY is not set");
  }
  return Buffer.from(key, "hex");
}

/**
 * Encrypt a string (e.g., refresh_token)
 * Returns: iv:authTag:encryptedData (base64)
 */
export function encryptToken(plainText: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plainText, "utf8", "base64");
  encrypted += cipher.final("base64");

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encrypted (all base64)
  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted,
  ].join(":");
}

/**
 * Decrypt a token string
 */
export function decryptToken(encryptedString: string): string {
  const key = getEncryptionKey();
  const [ivBase64, authTagBase64, encrypted] = encryptedString.split(":");

  if (!ivBase64 || !authTagBase64 || !encrypted) {
    throw new Error("Invalid encrypted token format");
  }

  const iv = Buffer.from(ivBase64, "base64");
  const authTag = Buffer.from(authTagBase64, "base64");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, "base64", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
