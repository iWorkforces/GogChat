/**
 * Multi-account notification identity helpers.
 *
 * Account index is always derived in main from IPC sender — never from the page.
 */

import type { IpcMainEvent } from 'electron';
import type { AccountIndex } from '../../../shared/types/branded.js';
import { asWebContentsId } from '../../../shared/types/branded.js';
import { getSharedFeatureContext } from '../lifecycle/featureContextStore.js';

const TAG_MAX_LENGTH = 200;

/**
 * Resolve the account that owns the IPC sender WebContents, if registered.
 */
export function resolveAccountIndexFromIpcEvent(
  event: IpcMainEvent | undefined
): AccountIndex | null {
  if (!event?.sender || event.sender.isDestroyed()) {
    return null;
  }
  const manager = getSharedFeatureContext().accountWindowManager;
  if (!manager) {
    return null;
  }
  return manager.getAccountForWebContents(asWebContentsId(event.sender.id));
}

/**
 * Human-visible account label for notification subtitle.
 * Always shown (including single-account). 1-based for users; logs keep 0-based index.
 */
export function formatAccountNotificationLabel(
  accountIndex: AccountIndex | null,
  customLabel?: string
): string {
  if (customLabel !== undefined && customLabel.trim().length > 0) {
    return customLabel.trim();
  }
  if (accountIndex === null) {
    return 'GogChat';
  }
  return `Account ${accountIndex + 1}`;
}

/**
 * Notification Center group id for an account (or global fallback).
 */
export function accountNotificationGroupId(accountIndex: AccountIndex | null): string {
  if (accountIndex === null) {
    return 'gogchat-account-unknown';
  }
  return `gogchat-account-${accountIndex}`;
}

/**
 * Namespace a Chat (or synthetic) tag so de-dupe is per-account.
 * Account prefix is never truncated; long Chat tags are shortened to fit 200 chars.
 */
export function namespaceNotificationTag(
  accountIndex: AccountIndex | null,
  chatTag: string | undefined
): string {
  const prefix = accountIndex === null ? 'a?' : `a${accountIndex}`;
  const base = chatTag && chatTag.length > 0 ? chatTag : `notif-${Date.now()}`;
  const combined = `${prefix}:${base}`;
  if (combined.length <= TAG_MAX_LENGTH) {
    return combined;
  }
  const budget = TAG_MAX_LENGTH - prefix.length - 1;
  if (budget < 8) {
    return combined.slice(0, TAG_MAX_LENGTH);
  }
  return `${prefix}:${base.slice(0, budget)}`;
}

/** Unread-delta tag base (before namespacing). */
export const UNREAD_DELTA_TAG_BASE = 'gogchat-unread-delta';
