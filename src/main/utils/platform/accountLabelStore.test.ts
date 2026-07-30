/**
 * Unit tests for account label persistence helpers.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const labelsStore: { value: Record<string, string> } = { value: {} };

vi.mock('../../config.js', () => ({
  configGet: vi.fn((key: string) => {
    if (key === 'app.accountLabels') return { ...labelsStore.value };
    return undefined;
  }),
  configSet: vi.fn((key: string, value: Record<string, string>) => {
    if (key === 'app.accountLabels') {
      labelsStore.value = { ...value };
    }
  }),
}));

vi.mock('../../../shared/constants.js', () => ({
  ACCOUNT_LABEL: { MAX_LENGTH: 40 },
}));

describe('accountLabelStore', () => {
  beforeEach(() => {
    vi.resetModules();
    labelsStore.value = {};
  });

  it('sets, gets, and clears labels with max length', async () => {
    const {
      setStoredAccountLabel,
      getStoredAccountLabel,
      clearStoredAccountLabels,
      getAllStoredAccountLabels,
      sanitizeAccountLabelInput,
    } = await import('./accountLabelStore.js');

    setStoredAccountLabel(0 as never, '  Work  ');
    expect(getStoredAccountLabel(0 as never)).toBe('Work');

    setStoredAccountLabel(0 as never, '   ');
    expect(getStoredAccountLabel(0 as never)).toBeUndefined();

    setStoredAccountLabel(1 as never, 'Personal');
    expect(getAllStoredAccountLabels()).toEqual({ '1': 'Personal' });

    clearStoredAccountLabels();
    expect(getAllStoredAccountLabels()).toEqual({});

    expect(sanitizeAccountLabelInput('x'.repeat(50)).length).toBe(40);
  });
});
