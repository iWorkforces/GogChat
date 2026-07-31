/**
 * Security-critical boolean flags persisted with authenticated encryption
 * via Electron `safeStorage` (OS credential-store-backed).
 *
 * Why a dedicated helper?
 * -----------------------
 * The regular `electron-store` path is not authenticated encryption. Kill
 * switches that must not be silently flipped by on-disk tampering live here.
 *
 * Active product flag: `disableCdpTelemetry` (local CDP RUM).
 * Residual storage key: `disableCertPinning` remains in the encrypted blob
 * API for compatibility/tests only — custom certificate pinning was removed
 * and no startup path consults this flag for TLS trust (Chromium is sole
 * trust authority).
 *
 * `safeStorage.encryptString()` provides authenticated encryption (the
 * payload is bound to the OS credential-store entry), so any tampering causes
 * decryption to fail and we fall back to the safest default (`false`).
 *
 * Storage location: `<userData>/secure-flags.enc` — a single encrypted JSON
 * blob. We intentionally do NOT mirror the value into electron-store after
 * reading, otherwise an attacker could simply edit the plaintext-MAC-less
 * mirror.
 *
 * Lifecycle: read/write are synchronous. All filesystem operations are
 * wrapped in try/catch and default to `false` on any failure.
 */

import { safeStorage, app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import log from 'electron-log';

const SECURE_FLAGS_FILE = 'secure-flags.enc';

interface SecureFlags {
  disableCertPinning?: boolean;
  disableCdpTelemetry?: boolean;
}

function getSecureFlagsPath(): string {
  return path.join(app.getPath('userData'), SECURE_FLAGS_FILE);
}

/**
 * Read and decrypt the secure flags blob.
 * Returns an empty object on any failure (missing file, decrypt failure,
 * malformed JSON, safeStorage unavailable).
 */
function readSecureFlags(): SecureFlags {
  try {
    const filePath = getSecureFlagsPath();
    if (!fs.existsSync(filePath)) {
      return {};
    }

    if (!safeStorage.isEncryptionAvailable()) {
      log.warn('[SecureFlags] safeStorage unavailable — refusing to read encrypted flags');
      return {};
    }

    const encrypted = fs.readFileSync(filePath);
    const plaintext = safeStorage.decryptString(encrypted);
    const parsed: unknown = JSON.parse(plaintext);

    if (parsed === null || typeof parsed !== 'object') {
      return {};
    }
    return parsed;
  } catch (error: unknown) {
    log.warn('[SecureFlags] Failed to read secure flags, defaulting to safe values:', error);
    return {};
  }
}

/**
 * Encrypt and persist the secure flags blob.
 * Throws if safeStorage is unavailable so callers learn that the value
 * could not be securely persisted.
 */
function writeSecureFlags(flags: SecureFlags): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('[SecureFlags] safeStorage unavailable — cannot persist secure flag');
  }

  const filePath = getSecureFlagsPath();
  const plaintext = JSON.stringify(flags);
  const encrypted = safeStorage.encryptString(plaintext);
  fs.writeFileSync(filePath, encrypted);
}

/**
 * Returns the persisted `disableCertPinning` flag.
 *
 * Defaults to `false` (the safe default — pinning enabled) on any error,
 * including missing file, decryption failure, or unavailable safeStorage.
 *
 * Safe to call before `app.whenReady` — `safeStorage` is queried
 * lazily and a missing file simply returns the default.
 */
export function getDisableCertPinning(): boolean {
  return readSecureFlags().disableCertPinning === true;
}

/**
 * Persist the `disableCertPinning` flag using authenticated encryption.
 * Throws if safeStorage is unavailable.
 */
export function setDisableCertPinning(value: boolean): void {
  const current = readSecureFlags();
  current.disableCertPinning = value;
  writeSecureFlags(current);
}

/**
 * Returns the persisted `disableCdpTelemetry` flag.
 *
 * Defaults to `false` (telemetry enabled). When set to `true`, the CDP
 * telemetry feature becomes a no-op — useful as a privacy/perf kill switch
 * without rebuilding the app. Stored alongside other secure flags so it
 * cannot be silently flipped via tampering with the plaintext-MAC-less
 * electron-store mirror.
 */
export function getDisableCdpTelemetry(): boolean {
  return readSecureFlags().disableCdpTelemetry === true;
}

/**
 * Persist the `disableCdpTelemetry` flag using authenticated encryption.
 * Throws if safeStorage is unavailable.
 */
export function setDisableCdpTelemetry(value: boolean): void {
  const current = readSecureFlags();
  current.disableCdpTelemetry = value;
  writeSecureFlags(current);
}
