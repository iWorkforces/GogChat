/**
 * Shared routing-conformance harness.
 *
 * Runs the same account-routing scenarios against any IAccountWindowManager
 * (BrowserWindow default or WebContentsView). Assertions stay on contract
 * outcomes: visible account, child WebContents identity, auth preservation,
 * and the order of focus / hydrate / load *calls*. Electron completion order
 * is not assumed. Intentional backend differences are recorded, not forced
 * equal.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IAccountWindowManager } from '../../src/shared/types/window.js';
import type { AccountIndex } from '../../src/shared/types/branded.js';
import { asAccountIndex } from '../../src/shared/types/branded.js';
import { getAccountURL, loadAccountURL } from '../../src/main/utils/account/accountNavigation.js';

export type RoutingBackend = 'browser-window' | 'web-contents-view';

export type RoutingOp =
  | 'createAccountWindow'
  | 'focusAccount'
  | 'hydrateAccount'
  | 'dehydrateAccount'
  | 'loadAccountURL'
  | 'windowLoadURL'
  | 'webContentsLoadURL'
  | 'windowShow'
  | 'windowFocus';

export type RoutingTarget = 'account-child' | 'host' | 'window' | 'manager';

export interface RoutingCall {
  op: RoutingOp;
  accountIndex: number;
  url?: string;
  webContentsId?: number;
  target: RoutingTarget;
}

export interface RoutingSnapshot {
  backend: RoutingBackend;
  indices: number[];
  visible: number[];
  dehydrated: number[];
  liveWcByAccount: Record<number, number>;
  urlByAccount: Record<number, string | null>;
  hostLoadURLCount: number;
}

export interface IntentionalBackendDifference {
  id: string;
  browserWindow: string;
  webContentsView: string;
}

/** Documented, not-equal native behavior. Tests assert each side, not identity. */
export const INTENTIONAL_BACKEND_DIFFERENCES: readonly IntentionalBackendDifference[] = [
  {
    id: 'dehydrate-lifecycle',
    browserWindow:
      'dehydrateAccount destroys the BrowserWindow; getAccountWebContents returns null until hydrate',
    webContentsView:
      'dehydrateAccount parks the child view; getAccountWebContents still returns the same child WC',
  },
  {
    id: 'getAccountWindow',
    browserWindow: 'returns the per-account window, or null while dehydrated',
    webContentsView: 'returns the shared host for any known account, including parked',
  },
  {
    id: 'visibility-model',
    browserWindow: 'isAccountVisible follows that window isVisible(); multiple live windows may be visible',
    webContentsView: 'exactly one account is visible; switch-away is hidden-live, not dehydrated',
  },
  {
    id: 'account-0-dehydrate',
    browserWindow: 'idle/pressure skip account 0; public dehydrateAccount(0) still destroys if invoked',
    webContentsView: 'dehydrateAccount(0) is a no-op',
  },
  {
    id: 'reuse-navigation-surface',
    browserWindow: 'router reuse and post-hydrate apply use BrowserWindow.loadURL',
    webContentsView: 'reuse uses the child view webContents.loadURL and never the host',
  },
  {
    id: 'park-unpark',
    browserWindow: 'hydrate recreates a window against persist:account-N; factory owns snapshot loadURL',
    webContentsView: 'hydrate/focus unparks the existing view; the session is never destroyed',
  },
];

export const AUTH_URL = 'https://accounts.google.com/signin/v2/identifier';

export function chatUrl(accountIndex: number, suffix = ''): string {
  return `https://chat.google.com/u/${accountIndex}/${suffix}`;
}

type Loadable = {
  loadURL?: (url: string, ...rest: unknown[]) => unknown;
};

interface HeldLoad {
  resume: () => void;
}

export interface RoutingProbes {
  calls: RoutingCall[];
  holdLoads: () => void;
  releaseLoads: () => void;
  heldCount: () => number;
  wrapLiveSurfaces: () => void;
  snapshot: () => RoutingSnapshot;
}

export interface RoutingScenarioContext {
  backend: RoutingBackend;
  manager: IAccountWindowManager;
  probes: RoutingProbes;
  getPartition: (accountIndex: number) => string | null;
  getHostWebContents: () => Electron.WebContents | null;
}

function asMutableManager(manager: IAccountWindowManager): {
  createAccountWindow: IAccountWindowManager['createAccountWindow'];
  focusAccount: IAccountWindowManager['focusAccount'];
  hydrateAccount: IAccountWindowManager['hydrateAccount'];
  dehydrateAccount: IAccountWindowManager['dehydrateAccount'];
} {
  return manager;
}

function webContentsIdOf(wc: Electron.WebContents | null): number | undefined {
  if (!wc) return undefined;
  try {
    return wc.id;
  } catch {
    return undefined;
  }
}

/**
 * Instrument a live manager: record focus/hydrate/create/dehydrate and every
 * account-child vs host loadURL call. Optional hold gate keeps loadURL
 * promises unsettled so a second command can be issued first.
 */
export function attachRoutingProbes(
  backend: RoutingBackend,
  manager: IAccountWindowManager,
  getHostWebContents: () => Electron.WebContents | null = () => null
): RoutingProbes {
  const calls: RoutingCall[] = [];
  const wrapped = new WeakSet<object>();
  const chromeWrapped = new WeakSet<object>();
  let holding = false;
  const held: HeldLoad[] = [];

  const record = (call: RoutingCall): void => {
    calls.push(call);
  };

  const wrapLoadURL = (
    owner: Loadable,
    accountIndex: number,
    op: 'windowLoadURL' | 'webContentsLoadURL',
    target: RoutingTarget,
    wc: Electron.WebContents | null
  ): void => {
    if (typeof owner.loadURL !== 'function') return;
    if (wrapped.has(owner)) return;
    wrapped.add(owner);
    const original = owner.loadURL.bind(owner);
    owner.loadURL = (url: string, ...rest: unknown[]): unknown => {
      record({
        op,
        accountIndex,
        url,
        webContentsId: webContentsIdOf(wc),
        target,
      });
      if (!holding) {
        return original(url, ...rest);
      }
      return new Promise<void>((resolve, reject) => {
        held.push({
          resume: () => {
            try {
              Promise.resolve(original(url, ...rest)).then(
                () => {
                  resolve();
                },
                (error: unknown) => {
                  reject(error);
                }
              );
            } catch (error: unknown) {
              reject(error);
            }
          },
        });
      });
    };
  };

  const wrapLiveSurfaces = (): void => {
    const host = getHostWebContents();
    if (host) {
      wrapLoadURL(host, -1, 'webContentsLoadURL', 'host', host);
    }
    for (const info of manager.enumerateAccountWebContents()) {
      const idx = Number(info.accountIndex);
      wrapLoadURL(info.webContents, idx, 'webContentsLoadURL', 'account-child', info.webContents);
      const window = manager.getAccountWindow(info.accountIndex);
      if (!window) continue;
      const windowIsHost = backend === 'web-contents-view';
      wrapLoadURL(
        window,
        idx,
        'windowLoadURL',
        windowIsHost ? 'host' : 'window',
        windowIsHost ? host : window.webContents
      );
      wrapWindowChrome(window, idx, windowIsHost ? 'host' : 'window');
    }
  };

  const wrapWindowChrome = (
    window: Electron.BrowserWindow,
    accountIndex: number,
    target: RoutingTarget
  ): void => {
    if (chromeWrapped.has(window)) {
      return;
    }
    chromeWrapped.add(window);
    const showable = window as Electron.BrowserWindow & { show?: () => void; focus?: () => void };
    if (typeof showable.show === 'function') {
      const originalShow = showable.show.bind(window);
      showable.show = (): void => {
        record({ op: 'windowShow', accountIndex, target });
        originalShow();
      };
    }
    if (typeof showable.focus === 'function') {
      const originalFocus = showable.focus.bind(window);
      showable.focus = (): void => {
        record({ op: 'windowFocus', accountIndex, target });
        originalFocus();
      };
    }
  };

  const mutable = asMutableManager(manager);
  const originalCreate = mutable.createAccountWindow.bind(manager);
  const originalFocus = mutable.focusAccount.bind(manager);
  const originalHydrate = mutable.hydrateAccount.bind(manager);
  const originalDehydrate = mutable.dehydrateAccount.bind(manager);

  mutable.createAccountWindow = (url: string, accountIndex: AccountIndex) => {
    record({
      op: 'createAccountWindow',
      accountIndex: Number(accountIndex),
      url,
      target: 'manager',
    });
    const window = originalCreate(url, accountIndex);
    wrapLiveSurfaces();
    return window;
  };
  mutable.focusAccount = (accountIndex: AccountIndex) => {
    record({ op: 'focusAccount', accountIndex: Number(accountIndex), target: 'manager' });
    originalFocus(accountIndex);
    wrapLiveSurfaces();
  };
  mutable.hydrateAccount = (accountIndex: AccountIndex) => {
    record({ op: 'hydrateAccount', accountIndex: Number(accountIndex), target: 'manager' });
    const window = originalHydrate(accountIndex);
    wrapLiveSurfaces();
    return window;
  };
  mutable.dehydrateAccount = (accountIndex: AccountIndex) => {
    record({ op: 'dehydrateAccount', accountIndex: Number(accountIndex), target: 'manager' });
    originalDehydrate(accountIndex);
  };

  const snapshot = (): RoutingSnapshot => {
    const indices = manager.listAccountIndices().map((idx) => Number(idx));
    const visible = indices.filter((idx) => manager.isAccountVisible(asAccountIndex(idx)));
    const dehydrated = indices.filter((idx) => manager.isDehydrated(asAccountIndex(idx)));
    const liveWcByAccount: Record<number, number> = {};
    const urlByAccount: Record<number, string | null> = {};
    for (const idx of indices) {
      const wc = manager.getAccountWebContents(asAccountIndex(idx));
      if (wc && !wc.isDestroyed()) {
        const id = webContentsIdOf(wc);
        if (id !== undefined) {
          liveWcByAccount[idx] = id;
        }
      }
      urlByAccount[idx] = getAccountURL(manager, asAccountIndex(idx));
    }
    return {
      backend,
      indices,
      visible,
      dehydrated,
      liveWcByAccount,
      urlByAccount,
      hostLoadURLCount: calls.filter(
        (call) =>
          call.target === 'host' &&
          (call.op === 'windowLoadURL' || call.op === 'webContentsLoadURL')
      ).length,
    };
  };

  return {
    calls,
    holdLoads: () => {
      holding = true;
    },
    releaseLoads: () => {
      holding = false;
      const pending = held.splice(0, held.length);
      for (const item of pending) {
        item.resume();
      }
    },
    heldCount: () => held.length,
    wrapLiveSurfaces,
    snapshot,
  };
}

function accountChildLoads(calls: RoutingCall[], accountIndex: number): RoutingCall[] {
  return calls.filter(
    (call) =>
      call.accountIndex === accountIndex &&
      (call.op === 'webContentsLoadURL' || call.op === 'windowLoadURL') &&
      call.target !== 'host'
  );
}

function opsNamed(calls: RoutingCall[], op: RoutingOp): RoutingCall[] {
  return calls.filter((call) => call.op === op);
}

/**
 * Shared matrix. Each backend file supplies a fresh manager + partition/host
 * accessors that match that file's Electron mocks.
 */
export function runSharedRoutingScenarios(options: {
  backend: RoutingBackend;
  createContext: () => RoutingScenarioContext;
}): void {
  describe(`routing conformance matrix (${options.backend})`, () => {
    let ctx: RoutingScenarioContext;

    beforeEach(() => {
      ctx = options.createContext();
    });

    afterEach(() => {
      ctx.probes.releaseLoads();
      ctx.manager.destroyAll();
    });

    it('executes the documented BrowserWindow vs WebContentsView differences', () => {
      const { manager } = ctx;
      manager.createAccountWindow(chatUrl(0), asAccountIndex(0));
      manager.createAccountWindow(chatUrl(2), asAccountIndex(2));
      const wc2 = manager.getAccountWebContents(asAccountIndex(2));
      const window2 = manager.getAccountWindow(asAccountIndex(2));

      if (options.backend === 'web-contents-view') {
        expect(manager.isAccountVisible(asAccountIndex(2))).toBe(true);
        expect(manager.isAccountVisible(asAccountIndex(0))).toBe(false);
        expect(manager.isDehydrated(asAccountIndex(0))).toBe(false);
        manager.dehydrateAccount(asAccountIndex(2));
        expect(manager.getAccountWebContents(asAccountIndex(2))).toBe(wc2);
        expect(manager.getAccountWindow(asAccountIndex(2))).toBe(window2);
        manager.dehydrateAccount(asAccountIndex(0));
        expect(manager.isDehydrated(asAccountIndex(0))).toBe(false);
        expect(manager.getAccountWebContents(asAccountIndex(0))).not.toBeNull();
      } else {
        expect(manager.isAccountVisible(asAccountIndex(2))).toBe(true);
        manager.dehydrateAccount(asAccountIndex(2));
        expect(manager.getAccountWebContents(asAccountIndex(2))).toBeNull();
        expect(manager.getAccountWindow(asAccountIndex(2))).toBeNull();
        manager.dehydrateAccount(asAccountIndex(0));
        expect(manager.isDehydrated(asAccountIndex(0))).toBe(true);
        expect(manager.getAccountWebContents(asAccountIndex(0))).toBeNull();
      }
    });

    it('keeps sparse indices and routes the live target child WebContents', () => {
      const { manager, probes, getPartition } = ctx;
      manager.createAccountWindow(chatUrl(0), asAccountIndex(0));
      manager.createAccountWindow(chatUrl(2), asAccountIndex(2));
      probes.wrapLiveSurfaces();

      expect(manager.listAccountIndices()).toEqual([0, 2]);
      expect(manager.hasAccount(asAccountIndex(1))).toBe(false);
      expect(manager.hasAccount(asAccountIndex(2))).toBe(true);
      expect(getPartition(0)).toBe('persist:account-0');
      expect(getPartition(2)).toBe('persist:account-2');

      const wc2 = manager.getAccountWebContents(asAccountIndex(2));
      expect(wc2).not.toBeNull();
      expect(wc2?.isDestroyed()).toBe(false);
      const host = ctx.getHostWebContents();
      if (options.backend === 'web-contents-view') {
        expect(wc2).not.toBe(host);
        expect(manager.isAccountVisible(asAccountIndex(2))).toBe(true);
        expect(manager.isAccountVisible(asAccountIndex(0))).toBe(false);
        expect(manager.isDehydrated(asAccountIndex(0))).toBe(false);
        const hostWindow = manager.getMostRecentWindow() as
          | { loadURL?: { mock?: { calls: unknown[] } } }
          | null;
        if (hostWindow?.loadURL && 'mock' in hostWindow.loadURL) {
          expect(hostWindow.loadURL.mock?.calls ?? []).toHaveLength(0);
        }
      } else {
        expect(manager.isAccountVisible(asAccountIndex(2))).toBe(true);
      }

      const before = probes.calls.length;
      manager.createAccountWindow(chatUrl(2, 'room/live'), asAccountIndex(2));
      const reuseLoads = probes.calls
        .slice(before)
        .filter(
          (call) =>
            (call.op === 'webContentsLoadURL' || call.op === 'windowLoadURL') &&
            call.target !== 'host'
        );
      expect(reuseLoads.length).toBeGreaterThan(0);
      expect(reuseLoads.every((call) => call.accountIndex === 2)).toBe(true);
      expect(manager.getAccountWebContents(asAccountIndex(2))).toBe(wc2);
      expect(probes.snapshot().hostLoadURLCount).toBe(0);
    });

    it('covers dehydrate/hydrate or hidden-live/park without touching account 0 identity', () => {
      const { manager, probes, getPartition } = ctx;
      manager.createAccountWindow(chatUrl(0), asAccountIndex(0));
      manager.createAccountWindow(chatUrl(2), asAccountIndex(2));
      const wc0 = manager.getAccountWebContents(asAccountIndex(0));
      const wc2Before = manager.getAccountWebContents(asAccountIndex(2));
      expect(wc0).not.toBeNull();
      expect(wc2Before).not.toBeNull();

      if (options.backend === 'web-contents-view') {
        manager.focusAccount(asAccountIndex(0));
        expect(manager.isAccountVisible(asAccountIndex(0))).toBe(true);
        expect(manager.isAccountVisible(asAccountIndex(2))).toBe(false);
        expect(manager.isDehydrated(asAccountIndex(2))).toBe(false);
        expect(manager.getAccountWebContents(asAccountIndex(2))).toBe(wc2Before);
      }

      manager.dehydrateAccount(asAccountIndex(2));
      expect(manager.hasAccount(asAccountIndex(2))).toBe(true);
      expect(manager.isDehydrated(asAccountIndex(2))).toBe(true);
      expect(manager.isAccountVisible(asAccountIndex(2))).toBe(false);
      expect(manager.isDehydrated(asAccountIndex(0))).toBe(false);
      expect(manager.getAccountWebContents(asAccountIndex(0))).toBe(wc0);
      expect(getPartition(0)).toBe('persist:account-0');

      if (options.backend === 'browser-window') {
        expect(manager.getAccountWebContents(asAccountIndex(2))).toBeNull();
        expect(manager.getAccountWindow(asAccountIndex(2))).toBeNull();
      } else {
        expect(manager.getAccountWebContents(asAccountIndex(2))).toBe(wc2Before);
        expect(manager.getAccountWindow(asAccountIndex(2))).not.toBeNull();
      }

      const before = probes.calls.length;
      manager.focusAccount(asAccountIndex(2));
      expect(manager.isDehydrated(asAccountIndex(2))).toBe(false);
      expect(manager.isAccountVisible(asAccountIndex(2))).toBe(true);
      const restored = manager.getAccountWebContents(asAccountIndex(2));
      expect(restored).not.toBeNull();
      expect(getPartition(2)).toBe('persist:account-2');
      expect(opsNamed(probes.calls.slice(before), 'focusAccount').map((c) => c.accountIndex)).toEqual(
        [2]
      );
      if (options.backend === 'web-contents-view') {
        expect(restored).toBe(wc2Before);
        expect(restored).not.toBe(ctx.getHostWebContents());
      }
      expect(probes.snapshot().hostLoadURLCount).toBe(0);
    });

    it('refuses to park account 0 on the WebContentsView path and keeps persist:account-0', () => {
      const { manager, getPartition } = ctx;
      manager.createAccountWindow(chatUrl(0), asAccountIndex(0));
      manager.createAccountWindow(chatUrl(2), asAccountIndex(2));
      const wc0 = manager.getAccountWebContents(asAccountIndex(0));

      manager.dehydrateAccount(asAccountIndex(0));
      if (options.backend === 'web-contents-view') {
        expect(manager.isDehydrated(asAccountIndex(0))).toBe(false);
        expect(manager.getAccountWebContents(asAccountIndex(0))).toBe(wc0);
      } else {
        expect(manager.isDehydrated(asAccountIndex(0))).toBe(true);
        expect(manager.getAccountWebContents(asAccountIndex(0))).toBeNull();
      }
      expect(getPartition(0)).toBe('persist:account-0');
    });

    it('protects a bootstrap Google auth page and still focuses the account', () => {
      const { manager, probes } = ctx;
      manager.createAccountWindow(AUTH_URL, asAccountIndex(2));
      manager.markAsBootstrap(asAccountIndex(2));
      const wc = manager.getAccountWebContents(asAccountIndex(2));
      expect(wc).not.toBeNull();
      if (wc && typeof wc.getURL === 'function') {
        // Keep the live auth URL even if create() stored AUTH_URL already.
        expect(getAccountURL(manager, asAccountIndex(2))).toContain('accounts.google.com');
      }

      const loadsBefore = accountChildLoads(probes.calls, 2).length;
      const created = manager.createAccountWindow(chatUrl(2, 'room/after-auth'), asAccountIndex(2));
      expect(created).toBeTruthy();
      expect(accountChildLoads(probes.calls, 2).length).toBe(loadsBefore);
      expect(loadAccountURL(manager, asAccountIndex(2), chatUrl(2, 'room/nav'))).toBe(false);
      expect(getAccountURL(manager, asAccountIndex(2))).toContain('accounts.google.com');
      manager.focusAccount(asAccountIndex(2));
      expect(opsNamed(probes.calls, 'focusAccount').some((call) => call.accountIndex === 2)).toBe(
        true
      );
      expect(manager.isAccountVisible(asAccountIndex(2))).toBe(true);
    });

    it('issues both loadURL calls when a second command arrives before the first settles', () => {
      const { manager, probes } = ctx;
      manager.createAccountWindow(chatUrl(2), asAccountIndex(2));
      probes.wrapLiveSurfaces();
      probes.holdLoads();

      const first = chatUrl(2, 'room/first');
      const second = chatUrl(2, 'room/second');
      manager.createAccountWindow(first, asAccountIndex(2));
      manager.createAccountWindow(second, asAccountIndex(2));

      const loads = accountChildLoads(probes.calls, 2).filter(
        (call) => call.url === first || call.url === second
      );
      expect(loads.map((call) => call.url)).toEqual([first, second]);
      expect(probes.heldCount()).toBeGreaterThanOrEqual(2);
      expect(manager.isAccountVisible(asAccountIndex(2))).toBe(true);
      expect(manager.getAccountWebContents(asAccountIndex(2))).not.toBeNull();
      expect(probes.snapshot().hostLoadURLCount).toBe(0);

      probes.releaseLoads();
      // Call order is the contract. Do not treat the later request as a
      // latest-navigation policy for Electron's eventual URL.
      expect(loads[0]?.url).toBe(first);
      expect(loads[1]?.url).toBe(second);
    });

    it('records show/focus before reuse navigation on a live account', () => {
      const { manager, probes } = ctx;
      manager.createAccountWindow(chatUrl(2), asAccountIndex(2));
      probes.wrapLiveSurfaces();
      const start = probes.calls.length;
      manager.createAccountWindow(chatUrl(2, 'room/focus-first'), asAccountIndex(2));

      const slice = probes.calls.slice(start);
      const firstFocus = slice.find(
        (call) =>
          call.op === 'windowShow' || call.op === 'windowFocus' || call.op === 'focusAccount'
      );
      const firstNav = slice.find(
        (call) =>
          (call.op === 'windowLoadURL' || call.op === 'webContentsLoadURL') &&
          call.target !== 'host' &&
          call.url === chatUrl(2, 'room/focus-first')
      );
      expect(firstFocus).toBeDefined();
      expect(firstNav).toBeDefined();
      expect(slice.indexOf(firstFocus!)).toBeLessThan(slice.indexOf(firstNav!));
      if (options.backend === 'web-contents-view') {
        expect(firstNav?.target).toBe('account-child');
        expect(firstNav?.op).toBe('webContentsLoadURL');
      } else {
        expect(firstNav?.target).toBe('window');
        expect(firstNav?.op).toBe('windowLoadURL');
      }
    });

    it('does not load a dehydrated BrowserWindow until focus recreates WebContents', () => {
      const { manager } = ctx;
      manager.createAccountWindow(chatUrl(2), asAccountIndex(2));
      manager.dehydrateAccount(asAccountIndex(2));
      expect(manager.hasAccount(asAccountIndex(2))).toBe(true);

      if (options.backend === 'browser-window') {
        expect(manager.getAccountWebContents(asAccountIndex(2))).toBeNull();
        expect(loadAccountURL(manager, asAccountIndex(2), chatUrl(2, 'room/x'))).toBe(false);
        manager.focusAccount(asAccountIndex(2));
        expect(manager.getAccountWebContents(asAccountIndex(2))).not.toBeNull();
        expect(loadAccountURL(manager, asAccountIndex(2), chatUrl(2, 'room/x'))).toBe(true);
      } else {
        expect(manager.getAccountWebContents(asAccountIndex(2))).not.toBeNull();
        expect(loadAccountURL(manager, asAccountIndex(2), chatUrl(2, 'room/x'))).toBe(true);
      }
    });

    it('routes overlapping commands to different live accounts', () => {
      const { manager, probes } = ctx;
      manager.createAccountWindow(chatUrl(2), asAccountIndex(2));
      manager.createAccountWindow(chatUrl(3), asAccountIndex(3));
      probes.wrapLiveSurfaces();
      probes.holdLoads();

      const forTwo = chatUrl(2, 'room/a');
      const forThree = chatUrl(3, 'room/b');
      manager.createAccountWindow(forTwo, asAccountIndex(2));
      manager.createAccountWindow(forThree, asAccountIndex(3));

      expect(accountChildLoads(probes.calls, 2).some((call) => call.url === forTwo)).toBe(true);
      expect(accountChildLoads(probes.calls, 3).some((call) => call.url === forThree)).toBe(true);
      expect(manager.isAccountVisible(asAccountIndex(3))).toBe(true);
      if (options.backend === 'web-contents-view') {
        expect(manager.isAccountVisible(asAccountIndex(2))).toBe(false);
      }
      probes.releaseLoads();
    });

    it('does not navigate a missing account via loadAccountURL until create', () => {
      const { manager } = ctx;
      expect(loadAccountURL(manager, asAccountIndex(3), chatUrl(3))).toBe(false);
      expect(manager.hasAccount(asAccountIndex(3))).toBe(false);
      manager.createAccountWindow(chatUrl(3), asAccountIndex(3));
      expect(manager.hasAccount(asAccountIndex(3))).toBe(true);
      const wc = manager.getAccountWebContents(asAccountIndex(3));
      expect(wc).not.toBeNull();
      if (options.backend === 'web-contents-view') {
        expect(wc).not.toBe(ctx.getHostWebContents());
      }
    });
  });
}
