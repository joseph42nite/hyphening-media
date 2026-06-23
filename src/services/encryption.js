/**
 * Marketing Ops Center — Encryption Utilities
 * AES-256-GCM encryption for sensitive fields (API tokens, bank details).
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * @param {string} plaintext - The text to encrypt
 * @param {string} keyHex - 64-char hex string (32 bytes)
 * @returns {string} - Base64 encoded: iv + authTag + ciphertext
 */
export function encrypt(plaintext, keyHex) {
  if (!keyHex) throw new Error('Encryption key is required');
  
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) throw new Error('Encryption key must be 32 bytes (64 hex chars)');

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Pack: iv(16) + authTag(16) + ciphertext(variable)
  const result = Buffer.concat([iv, authTag, encrypted]);
  return result.toString('base64');
}

/**
 * Decrypt an AES-256-GCM encrypted string.
 * @param {string} encryptedBase64 - Base64 encoded packed string
 * @param {string} keyHex - 64-char hex string (32 bytes)
 * @returns {string} - Decrypted plaintext
 */
export function decrypt(encryptedBase64, keyHex) {
  if (!keyHex) throw new Error('Encryption key is required');
  
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) throw new Error('Encryption key must be 32 bytes (64 hex chars)');

  const buffer = Buffer.from(encryptedBase64, 'base64');
  
  const iv = buffer.subarray(0, IV_LENGTH);
  const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString('utf8');
}
