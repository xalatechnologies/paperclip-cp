import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// =============================================================================
// AES-256-GCM Encryption for secrets
//
// Key must be a 32-byte (64 hex char) string from SECRETS_ENCRYPTION_KEY env var.
// Encrypted format: base64(iv):base64(authTag):base64(ciphertext)
// =============================================================================

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const keyHex = process.env.SECRETS_ENCRYPTION_KEY;
  if (!keyHex || keyHex.length < 32) {
    throw new Error(
      'SECRETS_ENCRYPTION_KEY must be set and at least 32 characters. ' +
      'Generate with: openssl rand -hex 32',
    );
  }
  // Use first 64 hex chars (32 bytes) as key
  return Buffer.from(keyHex.slice(0, 64).padEnd(64, '0'), 'hex');
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return [
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

export function decrypt(encryptedData: string): string {
  const key = getKey();
  const parts = encryptedData.split(':');

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const [ivB64, authTagB64, encryptedB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const encrypted = Buffer.from(encryptedB64, 'base64');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}
