// @vitest-environment jsdom

/**
 * Offline page script: restore retry UI after failed checks without reload.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('offline page recovery UI', () => {
  let btn: HTMLButtonElement & { disabled: boolean; innerText: string; click: () => void };

  beforeEach(async () => {
    document.body.innerHTML = '<button id="retry-btn">Retry</button>';
    btn = document.getElementById('retry-btn') as typeof btn;
    vi.resetModules();
    await import('./index.js');
  });

  it('disables button while checking and re-enables on app:onlineCheckFailed', () => {
    btn.click();
    expect(btn.disabled).toBe(true);
    expect(btn.innerText).toBe('Checking...');

    window.dispatchEvent(new Event('app:onlineCheckFailed'));
    expect(btn.disabled).toBe(false);
    expect(btn.innerText).toBe('Retry');
  });

  it('dispatches app:checkIfOnline on click', () => {
    const seen: string[] = [];
    window.addEventListener('app:checkIfOnline', () => {
      seen.push('check');
    });
    btn.click();
    expect(seen).toEqual(['check']);
  });

  it('restores retry after multiple failed checks', () => {
    for (let i = 0; i < 3; i++) {
      btn.click();
      expect(btn.disabled).toBe(true);
      window.dispatchEvent(new Event('app:onlineCheckFailed'));
      expect(btn.disabled).toBe(false);
      expect(btn.innerText).toBe('Retry');
    }
  });
});
