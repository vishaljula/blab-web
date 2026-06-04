import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
let key: Buffer | null = null;

function getKey(): Buffer {
  if (!key) {
    const keyHex = process.env.ENCRYPTION_KEY || "";
    key = Buffer.from(keyHex, "hex");
    if (key.length !== 32) {
      throw new Error(`Invalid ENCRYPTION_KEY length (${key.length} bytes). Must be a 32-byte hex string (64 characters).`);
    }
  }
  return key;
}

/**
 * Encrypts cleartext using AES-256-GCM.
 * Output is formatted as: ivHex:authTagHex:encryptedHex
 */
export function encrypt(text: string): string {
  if (!text) return "";
  const encryptionKey = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag.toString()}:${encrypted}`;
}

/**
 * Decrypts ciphertext formatted as ivHex:authTagHex:encryptedHex using AES-256-GCM.
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText) return "";
  const encryptionKey = getKey();
  try {
    const parts = encryptedText.split(":");
    if (parts.length !== 3) {
      throw new Error("Invalid encrypted format. Expected iv:authTag:ciphertext");
    }
    const [ivHex, authTagHex, encrypted] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (error) {
    console.error("PII Decryption error:", error);
    return "";
  }
}

/**
 * Generates a deterministic SHA-256 hash for database lookups.
 * Normalizes phone numbers / emails to match consistently.
 */
export function hashString(text: string): string {
  if (!text) return "";
  return crypto.createHash("sha256").update(text.trim().toLowerCase()).digest("hex");
}
