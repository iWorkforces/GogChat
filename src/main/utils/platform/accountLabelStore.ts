/**
 * Persist and read optional notification labels for multi-account slots.
 */

import { ACCOUNT_LABEL } from '../../../shared/constants.js';
import type { AccountIndex } from '../../../shared/types/branded.js';
import { configGet, configSet } from '../../config.js';

export type AccountLabelsMap = Record<string, string>;

function readLabels(): AccountLabelsMap {
  const raw = configGet('app.accountLabels');
  if (raw === undefined || raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const out: AccountLabelsMap = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string' && value.trim().length > 0) {
      out[key] = value.trim().slice(0, ACCOUNT_LABEL.MAX_LENGTH);
    }
  }
  return out;
}

/**
 * Stored custom label for an account, or undefined if unset.
 */
export function getStoredAccountLabel(accountIndex: AccountIndex): string | undefined {
  const labels = readLabels();
  const value = labels[String(accountIndex)];
  return value !== undefined && value.length > 0 ? value : undefined;
}

/**
 * Set or clear a custom account label. Empty / whitespace clears the entry.
 */
export function setStoredAccountLabel(accountIndex: AccountIndex, label: string): void {
  const labels = { ...readLabels() };
  const key = String(accountIndex);
  const trimmed = label.trim().slice(0, ACCOUNT_LABEL.MAX_LENGTH);
  if (trimmed.length === 0) {
    delete labels[key];
  } else {
    labels[key] = trimmed;
  }
  configSet('app.accountLabels', labels);
}

/**
 * Remove all custom account labels.
 */
export function clearStoredAccountLabels(): void {
  configSet('app.accountLabels', {});
}

/**
 * All stored labels (for menu display).
 */
export function getAllStoredAccountLabels(): AccountLabelsMap {
  return readLabels();
}

/**
 * Sanitize a label candidate for storage (trim + max length).
 */
export function sanitizeAccountLabelInput(label: string): string {
  return label.trim().slice(0, ACCOUNT_LABEL.MAX_LENGTH);
}
