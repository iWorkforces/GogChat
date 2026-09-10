/**
 * Deterministic Electron integration for the dual-backend routing matrix.
 *
 * Uses isolated TESTING constructors and the local harness document. Does not
 * load live Google Chat or require a packaged DMG.
 */

import { expect, test, evaluateWithRequire } from '../helpers/electron-test';

test.use({
  extraElectronEnv: {
    CI: 'true',
  },
});

type BackendResult = {
  backend: 'browser-window' | 'web-contents-view';
  indices: number[];
  visibleAfterSparse: number[];
  partition0: boolean;
  partition2: boolean;
  dehydrated2: boolean;
  account0DehydratedAfterPark2: boolean;
  account0StillLiveAfterDehydrate0: boolean;
  liveWcAfterPark2: boolean;
  hostNavigated: boolean;
  overlappingUrls: string[];
  overlappingPending: number;
  childWcIsHost: boolean;
};

type MatrixResult = {
  browserWindow: BackendResult;
  webContentsView: BackendResult;
};

test('routing conformance matrix covers both account backends', async ({ electronApp }) => {
  const result = await evaluateWithRequire(electronApp, async (api) => {
    const path = process.getBuiltinModule('path') as typeof import('node:path');
    const urlMod = process.getBuiltinModule('url') as typeof import('node:url');
    const harness = urlMod.pathToFileURL(
      path.join(process.cwd(), 'tests/fixtures/electron-harness.html')
    ).href;
    const other = `${harness}#second`;

    const g = globalThis as typeof globalThis & {
      __gogchatCreateAccountWindowManager?: (factory?: {
        createWindow: (url: string, partition: string) => Electron.BrowserWindow;
      }) => {
        createAccountWindow: (url: string, accountIndex: number) => Electron.BrowserWindow;
        focusAccount: (accountIndex: number) => void;
        dehydrateAccount: (accountIndex: number) => void;
        hydrateAccount: (accountIndex: number) => Electron.BrowserWindow | null;
        hasAccount: (accountIndex: number) => boolean;
        listAccountIndices: () => number[];
        isAccountVisible: (accountIndex: number) => boolean;
        isDehydrated: (accountIndex: number) => boolean;
        getAccountWebContents: (accountIndex: number) => Electron.WebContents | null;
        getAccountWindow: (accountIndex: number) => Electron.BrowserWindow | null;
        getMostRecentWindow: () => Electron.BrowserWindow | null;
        destroyAll: () => void;
      };
      __gogchatCreateAccountViewManager?: (factory?: {
        createWindow: (url: string, partition: string) => Electron.BrowserWindow;
      }) => {
        createAccountWindow: (url: string, accountIndex: number) => Electron.BrowserWindow;
        focusAccount: (accountIndex: number) => void;
        dehydrateAccount: (accountIndex: number) => void;
        hydrateAccount: (accountIndex: number) => Electron.BrowserWindow | null;
        hasAccount: (accountIndex: number) => boolean;
        listAccountIndices: () => number[];
        isAccountVisible: (accountIndex: number) => boolean;
        isDehydrated: (accountIndex: number) => boolean;
        getAccountWebContents: (accountIndex: number) => Electron.WebContents | null;
        getAccountWindow: (accountIndex: number) => Electron.BrowserWindow | null;
        getMostRecentWindow: () => Electron.BrowserWindow | null;
        destroyAll: () => void;
      };
    };

    const createBw = g.__gogchatCreateAccountWindowManager;
    const createWcv = g.__gogchatCreateAccountViewManager;
    if (!createBw || !createWcv) {
      throw new Error('TESTING isolated account-manager hooks are not installed');
    }

    const makeFactory = () => {
      const partitions = new Map<number, string>();
      return {
        partitions,
        createWindow: (url: string, partition: string) => {
          const match = /^persist:account-(\d+)$/.exec(partition);
          if (match && match[1] !== undefined) {
            partitions.set(Number(match[1]), partition);
          }
          const window = new api.BrowserWindow({
            show: false,
            webPreferences: {
              partition,
              sandbox: true,
              contextIsolation: true,
              nodeIntegration: false,
              webSecurity: true,
            },
          });
          void window.loadURL(url);
          return window;
        },
      };
    };

    const runBackend = (
      backend: 'browser-window' | 'web-contents-view'
    ): BackendResult => {
      const factory = makeFactory();
      const manager = backend === 'browser-window' ? createBw(factory) : createWcv(factory);
      const hostLoads: string[] = [];
      const overlappingUrls: string[] = [];
      let overlappingPending = 0;

      try {
        manager.createAccountWindow(harness, 0);
        manager.createAccountWindow(harness, 2);

        const hostWc =
          backend === 'web-contents-view' ? manager.getMostRecentWindow()?.webContents : null;
        if (hostWc && typeof hostWc.loadURL === 'function') {
          const originalHost = hostWc.loadURL.bind(hostWc);
          hostWc.loadURL = (url: string, options?: Electron.LoadURLOptions) => {
            hostLoads.push(url);
            return originalHost(url, options);
          };
        }

        const sessionMatches = (accountIndex: number): boolean => {
          const wc = manager.getAccountWebContents(accountIndex);
          if (!wc) return false;
          try {
            return wc.session === api.session.fromPartition(`persist:account-${accountIndex}`);
          } catch {
            return factory.partitions.get(accountIndex) === `persist:account-${accountIndex}`;
          }
        };
        const partition0 = sessionMatches(0);
        const partition2 = sessionMatches(2);

        const wc2 = manager.getAccountWebContents(2);
        const window2 = manager.getAccountWindow(2);
        const pending: Array<() => void> = [];
        const wrap = (
          owner: { loadURL: (url: string, options?: Electron.LoadURLOptions) => Promise<void> },
          original: (url: string, options?: Electron.LoadURLOptions) => Promise<void>
        ): void => {
          owner.loadURL = (url: string, options?: Electron.LoadURLOptions) => {
            overlappingUrls.push(url);
            return new Promise<void>((resolve, reject) => {
              pending.push(() => {
                Promise.resolve(original(url, options)).then(resolve, reject);
              });
            });
          };
        };
        // Wrap a single navigation surface per backend so BrowserWindow.loadURL
        // delegating to webContents.loadURL is not double-counted.
        if (backend === 'browser-window' && window2) {
          wrap(window2, window2.loadURL.bind(window2));
        } else if (wc2) {
          wrap(wc2, wc2.loadURL.bind(wc2));
        }

        manager.createAccountWindow(other, 2);
        manager.createAccountWindow(`${other}-b`, 2);
        overlappingPending = pending.length;
        pending.forEach((resume) => {
          resume();
        });

        const visibleAfterSparse = manager
          .listAccountIndices()
          .filter((idx) => manager.isAccountVisible(idx));

        manager.dehydrateAccount(2);
        const dehydrated2 = manager.isDehydrated(2);
        const account0DehydratedAfterPark2 = manager.isDehydrated(0);
        const liveWcAfterPark2 = manager.getAccountWebContents(2) !== null;

        manager.focusAccount(2);
        // WCV never parks account 0. Isolated BW shares the process bootstrap
        // set, so account 0 is typically bootstrap here and dehydrate is a
        // no-op — that public-destroy contract is locked in unit tests.
        if (backend === 'web-contents-view') {
          manager.dehydrateAccount(0);
        }
        const account0StillLiveAfterDehydrate0 =
          manager.isDehydrated(0) === false && manager.getAccountWebContents(0) !== null;

        const child = manager.getAccountWebContents(2);
        return {
          backend,
          indices: manager.listAccountIndices(),
          visibleAfterSparse,
          partition0,
          partition2,
          dehydrated2,
          account0DehydratedAfterPark2,
          account0StillLiveAfterDehydrate0,
          liveWcAfterPark2,
          hostNavigated: hostLoads.length > 0,
          overlappingUrls,
          overlappingPending,
          childWcIsHost: Boolean(hostWc && child && child === hostWc),
        };
      } finally {
        manager.destroyAll();
      }
    };

    return {
      browserWindow: runBackend('browser-window'),
      webContentsView: runBackend('web-contents-view'),
    };
  });

  expect(result.browserWindow.indices).toEqual([0, 2]);
  expect(result.webContentsView.indices).toEqual([0, 2]);
  expect(result.browserWindow.visibleAfterSparse).toContain(2);
  expect(result.webContentsView.visibleAfterSparse).toEqual([2]);

  expect(result.browserWindow.partition0).toBe(true);
  expect(result.browserWindow.partition2).toBe(true);
  expect(result.webContentsView.partition0).toBe(true);
  expect(result.webContentsView.partition2).toBe(true);

  expect(result.browserWindow.dehydrated2).toBe(true);
  expect(result.browserWindow.liveWcAfterPark2).toBe(false);
  expect(result.webContentsView.dehydrated2).toBe(true);
  expect(result.webContentsView.liveWcAfterPark2).toBe(true);

  expect(result.browserWindow.account0DehydratedAfterPark2).toBe(false);
  expect(result.webContentsView.account0DehydratedAfterPark2).toBe(false);
  expect(result.webContentsView.account0StillLiveAfterDehydrate0).toBe(true);
  expect(result.browserWindow.account0StillLiveAfterDehydrate0).toBe(true);

  expect(result.browserWindow.hostNavigated).toBe(false);
  expect(result.webContentsView.hostNavigated).toBe(false);
  expect(result.webContentsView.childWcIsHost).toBe(false);

  expect(result.browserWindow.overlappingUrls.length).toBe(2);
  expect(result.webContentsView.overlappingUrls.length).toBe(2);
  expect(result.browserWindow.overlappingPending).toBe(2);
  expect(result.webContentsView.overlappingPending).toBe(2);
});
