/**
 * Unit tests for WebContents-first account navigation helpers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IAccountWindowManager } from '../../../shared/types/window.js';
import { asAccountIndex } from '../../../shared/types/branded.js';
import { loadAccountURL, getAccountURL, sendToAccount } from './accountNavigation.js';

vi.mock('electron-log', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../shared/urlValidators.js', () => ({
  isGoogleAuthUrl: vi.fn().mockReturnValue(false),
}));

import { isGoogleAuthUrl } from '../../../shared/urlValidators.js';

function makeManager(wc: {
  isDestroyed: () => boolean;
  getURL: () => string;
  loadURL: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
} | null): IAccountWindowManager {
  return {
    getAccountWebContents: vi.fn().mockReturnValue(wc),
  } as unknown as IAccountWindowManager;
}

describe('accountNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isGoogleAuthUrl).mockReturnValue(false);
  });

  describe('loadAccountURL', () => {
    it('loads URL on live WebContents', () => {
      const loadURL = vi.fn().mockResolvedValue(undefined);
      const manager = makeManager({
        isDestroyed: () => false,
        getURL: () => 'https://mail.google.com/chat/u/0',
        loadURL,
        send: vi.fn(),
      });

      expect(loadAccountURL(manager, asAccountIndex(0), 'https://mail.google.com/chat/u/0/r/1')).toBe(
        true
      );
      expect(loadURL).toHaveBeenCalledWith('https://mail.google.com/chat/u/0/r/1');
    });

    it('returns false when WebContents missing', () => {
      const manager = makeManager(null);
      expect(loadAccountURL(manager, asAccountIndex(1), 'https://chat.google.com/u/1')).toBe(false);
    });

    it('skips loadURL on Google auth pages', () => {
      vi.mocked(isGoogleAuthUrl).mockReturnValue(true);
      const loadURL = vi.fn();
      const manager = makeManager({
        isDestroyed: () => false,
        getURL: () => 'https://accounts.google.com/signin',
        loadURL,
        send: vi.fn(),
      });

      expect(loadAccountURL(manager, asAccountIndex(0), 'https://mail.google.com/chat/u/0')).toBe(
        false
      );
      expect(loadURL).not.toHaveBeenCalled();
    });
  });

  describe('getAccountURL', () => {
    it('returns current URL', () => {
      const manager = makeManager({
        isDestroyed: () => false,
        getURL: () => 'https://chat.google.com/u/0',
        loadURL: vi.fn(),
        send: vi.fn(),
      });
      expect(getAccountURL(manager, asAccountIndex(0))).toBe('https://chat.google.com/u/0');
    });

    it('returns null when destroyed', () => {
      const manager = makeManager({
        isDestroyed: () => true,
        getURL: () => 'https://chat.google.com/u/0',
        loadURL: vi.fn(),
        send: vi.fn(),
      });
      expect(getAccountURL(manager, asAccountIndex(0))).toBeNull();
    });
  });

  describe('sendToAccount', () => {
    it('sends IPC to account WebContents', () => {
      const send = vi.fn();
      const manager = makeManager({
        isDestroyed: () => false,
        getURL: () => 'https://chat.google.com/u/0',
        loadURL: vi.fn(),
        send,
      });
      expect(sendToAccount(manager, asAccountIndex(0), 'searchShortcut')).toBe(true);
      expect(send).toHaveBeenCalledWith('searchShortcut');
    });

    it('returns false without WebContents', () => {
      expect(sendToAccount(makeManager(null), asAccountIndex(0), 'searchShortcut')).toBe(false);
    });
  });
});
