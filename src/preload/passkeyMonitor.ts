import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/constants.js';
import { validatePasskeyFailureData } from '../shared/dataValidators.js';

/**
 * Monitors WebAuthn API calls for passkey authentication failures
 * Detects when passkey authentication fails and notifies main process
 */

// Track if we've already reported a failure in this session to avoid spam
let hasReportedFailure = false;

// List of error types that indicate passkey authentication failed
const PASSKEY_ERROR_TYPES = [
  'NotAllowedError',
  'NotSupportedError',
  'SecurityError',
  'AbortError',
  'InvalidStateError',
];

/**
 * Reports passkey failure to main process via the exposed API
 */
function reportPasskeyFailure(errorName: string): void {
  // Only report once per session
  if (hasReportedFailure) {
    return;
  }

  // Check if window.gogchat API is available
  if (typeof window !== 'undefined' && window.gogchat && window.gogchat.reportPasskeyFailure) {
    hasReportedFailure = true;
    window.gogchat.reportPasskeyFailure(errorName);
    console.debug('[Passkey Monitor] Reported failure:', errorName);
    return;
  }
  hasReportedFailure = true;
  try {
    const validated = validatePasskeyFailureData(errorName);
    ipcRenderer.send(IPC_CHANNELS.PASSKEY_AUTH_FAILED, validated);
  } catch (error: unknown) {
    console.warn('[Passkey Monitor] Invalid passkey failure payload:', error);
  }
}

/**
 * Wraps navigator.credentials methods to detect failures
 */
function monitorWebAuthn(): void {
  // Check if navigator.credentials API exists
  if (!navigator.credentials) {
    console.debug('[Passkey Monitor] navigator.credentials not available');
    return;
  }

  // Save original methods
  const originalCreate = navigator.credentials.create.bind(navigator.credentials);
  const originalGet = navigator.credentials.get.bind(navigator.credentials);

  // Wrap navigator.credentials.create()
  navigator.credentials.create = async function (
    options?: CredentialCreationOptions
  ): Promise<Credential | null> {
    try {
      const result = await originalCreate(options);
      return result;
    } catch (error: unknown) {
      // Check if this is a passkey-related error
      if (
        error &&
        typeof error === 'object' &&
        'name' in error &&
        typeof error.name === 'string' &&
        PASSKEY_ERROR_TYPES.includes(error.name)
      ) {
        console.debug('[Passkey Monitor] create() failed:', error.name);
        reportPasskeyFailure(error.name);
      }
      throw error;
    }
  };

  // Wrap navigator.credentials.get()
  navigator.credentials.get = async function (
    options?: CredentialRequestOptions
  ): Promise<Credential | null> {
    try {
      const result = await originalGet(options);
      return result;
    } catch (error: unknown) {
      // Check if this is a passkey-related error
      if (
        error &&
        typeof error === 'object' &&
        'name' in error &&
        typeof error.name === 'string' &&
        PASSKEY_ERROR_TYPES.includes(error.name)
      ) {
        console.debug('[Passkey Monitor] get() failed:', error.name);
        reportPasskeyFailure(error.name);
      }
      throw error;
    }
  };

  console.debug('[Passkey Monitor] WebAuthn monitoring initialized');
}

export function installPasskeyMonitor(): void {
  window.addEventListener('DOMContentLoaded', () => {
    monitorWebAuthn();
  });
}
