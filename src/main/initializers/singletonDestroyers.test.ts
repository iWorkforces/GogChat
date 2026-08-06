/**
 * Unit tests for singletonDestroyers.ts
 *
 * Verifies destroyAllSingletons calls each destroyer exactly once and in
 * the expected order. About/Update use dynamic import so they stay out of
 * the main bundle — tests mock those modules for the async import path.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockDestroyIconCache,
  mockDestroyDeduplicator,
  mockDestroyRateLimiter,
  mockDestroyPerformanceMonitor,
  mockDestroyUpdateWindow,
  mockDestroyAboutWindow,
} = vi.hoisted(() => ({
  mockDestroyIconCache: vi.fn(),
  mockDestroyDeduplicator: vi.fn(),
  mockDestroyRateLimiter: vi.fn(),
  mockDestroyPerformanceMonitor: vi.fn(),
  mockDestroyUpdateWindow: vi.fn(),
  mockDestroyAboutWindow: vi.fn(),
}));

vi.mock('../utils/platform/iconCache.js', () => ({
  destroyIconCache: mockDestroyIconCache,
}));

vi.mock('../utils/ipc/ipcDeduplicator.js', () => ({
  destroyDeduplicator: mockDestroyDeduplicator,
}));

vi.mock('../utils/ipc/rateLimiter.js', () => ({
  destroyRateLimiter: mockDestroyRateLimiter,
}));

vi.mock('../utils/lifecycle/performanceMonitor.js', () => ({
  destroyPerformanceMonitor: mockDestroyPerformanceMonitor,
}));

vi.mock('../utils/platform/updateWindow.js', () => ({
  destroyUpdateWindow: mockDestroyUpdateWindow,
}));

vi.mock('../features/aboutPanel.js', () => ({
  destroyAboutWindow: mockDestroyAboutWindow,
}));

import { destroyAllSingletons } from './singletonDestroyers';

describe('destroyAllSingletons', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should call every destroyer exactly once', async () => {
    await destroyAllSingletons();

    expect(mockDestroyAboutWindow).toHaveBeenCalledTimes(1);
    expect(mockDestroyUpdateWindow).toHaveBeenCalledTimes(1);
    expect(mockDestroyPerformanceMonitor).toHaveBeenCalledTimes(1);
    expect(mockDestroyDeduplicator).toHaveBeenCalledTimes(1);
    expect(mockDestroyRateLimiter).toHaveBeenCalledTimes(1);
    expect(mockDestroyIconCache).toHaveBeenCalledTimes(1);
  });

  it('should call destroyers in the documented order', async () => {
    const calls: string[] = [];
    mockDestroyAboutWindow.mockImplementation(() => calls.push('about'));
    mockDestroyUpdateWindow.mockImplementation(() => calls.push('update'));
    mockDestroyPerformanceMonitor.mockImplementation(() => calls.push('perf'));
    mockDestroyDeduplicator.mockImplementation(() => calls.push('dedup'));
    mockDestroyRateLimiter.mockImplementation(() => calls.push('rate'));
    mockDestroyIconCache.mockImplementation(() => calls.push('icon'));

    await destroyAllSingletons();

    expect(calls).toEqual(['about', 'update', 'perf', 'dedup', 'rate', 'icon']);
  });

  it('should propagate errors so callers can wrap in try/catch', async () => {
    mockDestroyAboutWindow.mockImplementation(() => {
      throw new Error('about boom');
    });

    await expect(destroyAllSingletons()).rejects.toThrow('about boom');
  });
});
