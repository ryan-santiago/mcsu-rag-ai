import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { env } from "@/env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

export type EncryptedSecret = {
  ciphertext: string;
  iv: string;
  authTag: string;
};

/**
 * Encrypts a plaintext secret (an API key) for storage — used by
 * `aiSettings`' embedding and chat API key fields. `env.ENCRYPTION_KEY` is
 * parsed as a 32-byte `Buffer` by `src/env.ts`, so it's ready to use
 * directly as an AES-256 key.
 */
export function encryptSecret(plaintext: string): EncryptedSecret {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, env.ENCRYPTION_KEY, iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

/** Inverse of `encryptSecret()`. Throws if the ciphertext was tampered with or the key rotated. */
export function decryptSecret(encrypted: EncryptedSecret): string {
  const decipher = createDecipheriv(ALGORITHM, env.ENCRYPTION_KEY, Buffer.from(encrypted.iv, "base64"));
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}
