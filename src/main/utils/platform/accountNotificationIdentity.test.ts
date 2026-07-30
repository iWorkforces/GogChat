/**
 * Unit tests for multi-account notification identity helpers.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAccountForWebContentsMock = vi.fn();
const getStoredAccountLabelMock = vi.fn();
const contextState = vi.hoisted(() => ({
  manager: {
    getAccountForWebContents: (...args: unknown[]) => getAccountForWebContentsMock(...args),
  } as { getAccountForWebContents: (...args: unknown[]) => unknown } | undefined,
}));

vi.mock('../lifecycle/featureContextStore.js', () => ({
  getSharedFeatureContext: () => ({
    accountWindowManager: contextState.manager,
  }),
}));

vi.mock('../../../shared/types/branded.js', () => ({
  asWebContentsId: (id: number) => id,
}));

vi.mock('./accountLabelStore.js', () => ({
  getStoredAccountLabel: (...args: unknown[]) => getStoredAccountLabelMock(...args),
}));

describe('accountNotificationIdentity', () => {
  beforeEach(() => {
    vi.resetModules();
    getAccountForWebContentsMock.mockReset();
    getStoredAccountLabelMock.mockReset();
    getStoredAccountLabelMock.mockReturnValue(undefined);
    contextState.manager = {
      getAccountForWebContents: (...args: unknown[]) => getAccountForWebContentsMock(...args),
    };
  });

  it('formatAccountNotificationLabel prefers custom override then stored then default', async () => {
    const { formatAccountNotificationLabel } = await import('./accountNotificationIdentity.js');
    expect(formatAccountNotificationLabel(0 as never)).toBe('Account 1');
    expect(formatAccountNotificationLabel(1 as never)).toBe('Account 2');
    expect(formatAccountNotificationLabel(null)).toBe('GogChat');
    expect(formatAccountNotificationLabel(0 as never, ' Work ')).toBe('Work');
    // Whitespace-only override falls through to default / stored
    expect(formatAccountNotificationLabel(0 as never, '   ')).toBe('Account 1');

    getStoredAccountLabelMock.mockReturnValue('Personal');
    expect(formatAccountNotificationLabel(1 as never)).toBe('Personal');
    expect(formatAccountNotificationLabel(1 as never, '')).toBe('Personal');
  });

  it('namespaceNotificationTag isolates accounts and preserves prefix', async () => {
    const { namespaceNotificationTag } = await import('./accountNotificationIdentity.js');
    expect(namespaceNotificationTag(0 as never, 'room-1')).toBe('a0:room-1');
    expect(namespaceNotificationTag(1 as never, 'room-1')).toBe('a1:room-1');
    expect(namespaceNotificationTag(null, 'x')).toBe('a?:x');
    const long = 'z'.repeat(300);
    const namespaced = namespaceNotificationTag(0 as never, long);
    expect(namespaced.startsWith('a0:')).toBe(true);
    expect(namespaced.length).toBeLessThanOrEqual(200);
  });

  it('accountNotificationGroupId is per account', async () => {
    const { accountNotificationGroupId } = await import('./accountNotificationIdentity.js');
    expect(accountNotificationGroupId(0 as never)).toBe('gogchat-account-0');
    expect(accountNotificationGroupId(null)).toBe('gogchat-account-unknown');
  });

  it('resolveAccountIndexFromIpcEvent uses manager mapping', async () => {
    getAccountForWebContentsMock.mockReturnValue(3);
    const { resolveAccountIndexFromIpcEvent } = await import('./accountNotificationIdentity.js');
    const event = { sender: { id: 42, isDestroyed: () => false } };
    expect(resolveAccountIndexFromIpcEvent(event as never)).toBe(3);
    expect(getAccountForWebContentsMock).toHaveBeenCalledWith(42);
  });

  it('resolveAccountIndexFromIpcEvent returns null for missing sender or manager', async () => {
    const { resolveAccountIndexFromIpcEvent } = await import('./accountNotificationIdentity.js');
    expect(resolveAccountIndexFromIpcEvent(undefined)).toBeNull();
    expect(
      resolveAccountIndexFromIpcEvent({
        sender: { id: 1, isDestroyed: () => true },
      } as never)
    ).toBeNull();

    contextState.manager = undefined;
    expect(
      resolveAccountIndexFromIpcEvent({
        sender: { id: 1, isDestroyed: () => false },
      } as never)
    ).toBeNull();
  });

  it('namespaceNotificationTag handles empty tag', async () => {
    const { namespaceNotificationTag } = await import('./accountNotificationIdentity.js');
    const withDefault = namespaceNotificationTag(0 as never, undefined);
    expect(withDefault.startsWith('a0:')).toBe(true);
  });
});
