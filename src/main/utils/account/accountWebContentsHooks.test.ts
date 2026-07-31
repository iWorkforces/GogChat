/**
 * Unit tests for multi-account WebContents hooks (KD13).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { asAccountIndex } from '../../../shared/types/branded.js';
import {
  clearAccountWebContentsHooksForTests,
  notifyAccountWebContentsCreated,
  notifyAccountWebContentsDestroyed,
  onAccountWebContentsCreated,
  setAccountWebContentsHooksManager,
} from './accountWebContentsHooks.js';

describe('accountWebContentsHooks', () => {
  beforeEach(() => {
    clearAccountWebContentsHooksForTests();
  });

  it('notifies listeners and runs disposer on destroy', () => {
    const disposer = vi.fn();
    const listener = vi.fn(() => disposer);
    onAccountWebContentsCreated(listener);

    const wc = { id: 1, isDestroyed: () => false } as unknown as Electron.WebContents;
    notifyAccountWebContentsCreated({
      accountIndex: asAccountIndex(1),
      webContents: wc,
      backend: 'browser-window',
    });
    expect(listener).toHaveBeenCalledTimes(1);

    notifyAccountWebContentsDestroyed(asAccountIndex(1));
    expect(disposer).toHaveBeenCalledTimes(1);
  });

  it('backfills existing accounts on subscribe', () => {
    const wc = { id: 2, isDestroyed: () => false } as unknown as Electron.WebContents;
    setAccountWebContentsHooksManager({
      enumerateAccountWebContents: () => [
        {
          accountIndex: asAccountIndex(0),
          webContentsId: 2 as never,
          osProcessId: 1,
          backend: 'web-contents-view' as const,
          webContents: wc,
        },
      ],
    } as never);

    const listener = vi.fn();
    onAccountWebContentsCreated(listener);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ accountIndex: 0, backend: 'web-contents-view' })
    );
  });
});
