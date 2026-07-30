/**
 * Unit tests for account label modal dialog.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadURL = vi.fn().mockResolvedValue(undefined);
const show = vi.fn();
const focus = vi.fn();
const close = vi.fn();
const isDestroyed = vi.fn().mockReturnValue(false);
const executeJavaScript = vi.fn();

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(function MockBrowserWindow(this: {
    loadURL: typeof loadURL;
    show: typeof show;
    focus: typeof focus;
    close: typeof close;
    isDestroyed: typeof isDestroyed;
    webContents: { executeJavaScript: typeof executeJavaScript };
  }) {
    this.loadURL = loadURL;
    this.show = show;
    this.focus = focus;
    this.close = close;
    this.isDestroyed = isDestroyed;
    this.webContents = { executeJavaScript };
  }),
}));

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../shared/constants.js', () => ({
  ACCOUNT_LABEL: { MAX_LENGTH: 40 },
}));

vi.mock('./accountLabelStore.js', () => ({
  sanitizeAccountLabelInput: vi.fn((s: string) => s.trim().slice(0, 40)),
}));

describe('promptAccountLabel', () => {
  beforeEach(() => {
    vi.resetModules();
    loadURL.mockClear().mockResolvedValue(undefined);
    show.mockClear();
    focus.mockClear();
    close.mockClear();
    isDestroyed.mockClear().mockReturnValue(false);
    executeJavaScript.mockClear();
  });

  it('returns sanitized string when user saves a label', async () => {
    executeJavaScript.mockResolvedValue('  Work  ');
    const { promptAccountLabel } = await import('./accountLabelDialog.js');
    const parent = {} as Electron.BrowserWindow;

    const result = await promptAccountLabel(parent, 0, 'Old');

    expect(result).toBe('Work');
    expect(loadURL).toHaveBeenCalled();
    expect(show).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
    const htmlUrl = loadURL.mock.calls[0]?.[0] as string;
    expect(htmlUrl.startsWith('data:text/html')).toBe(true);
    expect(decodeURIComponent(htmlUrl)).toContain('Account 1');
    expect(decodeURIComponent(htmlUrl)).toContain('Old');
  });

  it('escapes HTML entities in current label', async () => {
    executeJavaScript.mockResolvedValue(null);
    const { promptAccountLabel } = await import('./accountLabelDialog.js');
    await promptAccountLabel({} as Electron.BrowserWindow, 1, `a&b<"'>`);
    const html = decodeURIComponent(loadURL.mock.calls[0]?.[0] as string);
    expect(html).toContain('&amp;');
    expect(html).toContain('&lt;');
    expect(html).toContain('&gt;');
    expect(html).toContain('&quot;');
  });

  it('returns empty string when user clears', async () => {
    executeJavaScript.mockResolvedValue('');
    const { promptAccountLabel } = await import('./accountLabelDialog.js');
    expect(await promptAccountLabel({} as Electron.BrowserWindow, 0, 'X')).toBe('');
  });

  it('returns null when user cancels or result is non-string', async () => {
    executeJavaScript.mockResolvedValueOnce(null);
    const { promptAccountLabel } = await import('./accountLabelDialog.js');
    expect(await promptAccountLabel({} as Electron.BrowserWindow, 0, '')).toBeNull();

    executeJavaScript.mockResolvedValueOnce(42);
    expect(await promptAccountLabel({} as Electron.BrowserWindow, 0, '')).toBeNull();
  });

  it('returns null and logs on error', async () => {
    loadURL.mockRejectedValueOnce(new Error('load failed'));
    const { promptAccountLabel } = await import('./accountLabelDialog.js');
    expect(await promptAccountLabel({} as Electron.BrowserWindow, 0, '')).toBeNull();
    expect(close).toHaveBeenCalled();
  });

  it('skips show/close when window already destroyed', async () => {
    isDestroyed.mockReturnValue(true);
    executeJavaScript.mockResolvedValue('Ok');
    const { promptAccountLabel } = await import('./accountLabelDialog.js');
    await promptAccountLabel({} as Electron.BrowserWindow, 0, '');
    expect(show).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });
});
