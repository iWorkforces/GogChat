/**
 * Shutdown diagnostics must never reconstruct the account manager.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAccountWindowManager: vi.fn(() => {
    throw new Error('getAccountWindowManager must not run after destroy');
  }),
  getCacheSize: vi.fn().mockResolvedValue(2 * 1024 * 1024),
  fromPartition: vi.fn(),
  log: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('electron-log', () => ({ default: mocks.log }));
vi.mock('electron', () => ({
  session: {
    fromPartition: (...args: unknown[]) => mocks.fromPartition(...args),
  },
}));
vi.mock('../utils/lifecycle/featureRunner.js', () => ({
  getSummary: () => ({
    total: 0,
    initialized: 0,
    byPhase: { security: 0, critical: 0, ui: 0, deferred: 0 },
  }),
}));
vi.mock('../utils/platform/iconCache.js', () => ({
  getIconCache: () => ({
    getStats: () => ({
      size: 0,
      maxSize: 0,
      totalAccesses: 0,
      mostAccessed: '',
      leastAccessed: '',
    }),
  }),
}));
vi.mock('../config.js', () => ({
  getStore: () => {
    throw new Error('store unused');
  },
}));
vi.mock('../utils/ipc/rateLimiter.js', () => ({
  getRateLimiter: () => ({
    getAllStats: () => new Map(),
  }),
}));
vi.mock('../utils/ipc/ipcDeduplicator.js', () => ({
  getDeduplicator: () => ({
    getStats: () => ({ cacheHits: 0, cacheMisses: 0, deduplicatedCount: 0 }),
  }),
}));
vi.mock('../utils/account/accountWindowManager.js', () => ({
  getAccountWindowManager: mocks.getAccountWindowManager,
}));

import { logShutdownDiagnostics } from './shutdownDiagnostics.js';
import { asAccountIndex } from '../../shared/types/branded.js';

describe('logShutdownDiagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fromPartition.mockReturnValue({ getCacheSize: mocks.getCacheSize });
  });

  it('logs snapshotted account caches without reconstructing the manager', async () => {
    await logShutdownDiagnostics({
      accountIndices: [asAccountIndex(0), asAccountIndex(2)],
    });

    expect(mocks.getAccountWindowManager).not.toHaveBeenCalled();
    expect(mocks.fromPartition).toHaveBeenCalledWith('persist:account-0');
    expect(mocks.fromPartition).toHaveBeenCalledWith('persist:account-2');
    expect(mocks.log.info).toHaveBeenCalledWith(
      expect.stringContaining('Account 0 (persist:account-0) disk cache:')
    );
  });

  it('skips account cache logging when no indices were snapshotted', async () => {
    await logShutdownDiagnostics();
    expect(mocks.getAccountWindowManager).not.toHaveBeenCalled();
    expect(mocks.fromPartition).not.toHaveBeenCalled();
  });
});
