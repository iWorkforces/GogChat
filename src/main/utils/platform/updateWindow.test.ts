/**
 * Unit tests for native update dialog pure helpers and presentation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface MockBrowserWindow {
  loadURL: ReturnType<typeof vi.fn>;
  show: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
  setSize: ReturnType<typeof vi.fn>;
  setMenuBarVisibility: ReturnType<typeof vi.fn>;
  hide: ReturnType<typeof vi.fn>;
  isVisible: ReturnType<typeof vi.fn>;
  isDestroyed: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  removeAllListeners: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  once: ReturnType<typeof vi.fn>;
  webContents: {
    on: ReturnType<typeof vi.fn>;
    isDestroyed: ReturnType<typeof vi.fn>;
    executeJavaScript: ReturnType<typeof vi.fn>;
  };
  options?: Record<string, unknown>;
}

type GlobalWithMock = typeof globalThis & {
  __updateWindowMock?: { instances: MockBrowserWindow[] };
};

vi.mock('electron', () => {
  const instances: MockBrowserWindow[] = [];
  (globalThis as GlobalWithMock).__updateWindowMock = { instances };

  const BW = function MockBW(this: MockBrowserWindow, options?: Record<string, unknown>) {
    this.options = options;
    this.loadURL = vi.fn().mockResolvedValue(undefined);
    this.show = vi.fn();
    this.focus = vi.fn();
    this.setSize = vi.fn();
    this.setMenuBarVisibility = vi.fn();
    this.hide = vi.fn();
    this.isVisible = vi.fn().mockReturnValue(true);
    this.isDestroyed = vi.fn().mockReturnValue(false);
    this.destroy = vi.fn();
    this.removeAllListeners = vi.fn();
    this.on = vi.fn();
    this.once = vi.fn();
    this.webContents = {
      on: vi.fn(),
      isDestroyed: vi.fn().mockReturnValue(false),
      executeJavaScript: vi.fn().mockResolvedValue(undefined),
    };
    instances.push(this);
  };
  return {
    BrowserWindow: BW,
    app: {
      getVersion: vi.fn().mockReturnValue('1.2.3'),
      getAppPath: vi.fn().mockReturnValue('/mock/app'),
      isPackaged: false,
    },
  };
});

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    readFileSync: vi.fn().mockReturnValue('<svg>icon</svg>'),
  },
}));

vi.mock('electron-log', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function getInstances(): MockBrowserWindow[] {
  return (globalThis as GlobalWithMock).__updateWindowMock?.instances ?? [];
}

describe('updateWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    const state = (globalThis as GlobalWithMock).__updateWindowMock;
    if (state?.instances) state.instances.length = 0;
  });

  it('updateWindowHeightForButtonCount scales with actions', async () => {
    const { updateWindowHeightForButtonCount } = await import('./updateWindow.js');
    expect(updateWindowHeightForButtonCount(0)).toBe(340);
    expect(updateWindowHeightForButtonCount(1)).toBe(380);
    expect(updateWindowHeightForButtonCount(2)).toBe(400);
  });

  it('updateDialogAppVersion returns app version', async () => {
    const { updateDialogAppVersion } = await import('./updateWindow.js');
    expect(updateDialogAppVersion()).toBe('1.2.3');
  });

  it('checking phase returns immediately with aurora HTML', async () => {
    const { presentUpdateDialog, destroyUpdateWindow } = await import('./updateWindow.js');
    const result = await presentUpdateDialog({
      message: 'Checking for updates…',
      phase: 'checking',
    });
    expect(result.response).toBe(-1);

    const win = getInstances()[0]!;
    expect(win.loadURL).toHaveBeenCalled();
    const raw = win.loadURL.mock.calls[0]![0] as string;
    const html = decodeURIComponent(raw.replace('data:text/html;charset=utf-8,', ''));
    expect(html).toContain('app-icon-aurora--about');
    expect(html).toContain('Checking for updates');
    expect(html).toContain('data-phase="checking"');

    destroyUpdateWindow();
  });

  it('result phase waits for settle via Escape cancel', async () => {
    const mod = await import('./updateWindow.js');
    const promise = mod.presentUpdateDialog({
      message: 'GogChat is up to date',
      phase: 'result',
      buttons: [],
      cancelId: 0,
    });

    // Let loadURL .then run
    await Promise.resolve();
    await Promise.resolve();

    const win = getInstances()[0]!;
    const beforeInput = win.webContents.on.mock.calls.find(
      (c: unknown[]) => c[0] === 'before-input-event'
    );
    expect(beforeInput).toBeDefined();
    const handler = beforeInput![1] as (_e: unknown, input: { type: string; key: string }) => void;
    handler({}, { type: 'keyDown', key: 'Escape' });

    const result = await promise;
    expect(result.response).toBe(0);
    mod.destroyUpdateWindow();
  });

  it('beginUpdateDialogSession clears dismiss flag', async () => {
    const mod = await import('./updateWindow.js');
    mod.beginUpdateDialogSession();
    expect(mod.isUpdateSessionDismissed()).toBe(false);
    mod.destroyUpdateWindow();
  });
});
