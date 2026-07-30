/**
 * Unit tests for account label persistence helpers.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const labelsStore: { value: unknown } = { value: {} };

vi.mock('../../config.js', () => ({
  configGet: vi.fn((key: string) => {
    if (key === 'app.accountLabels') {
      if (labelsStore.value === undefined) return undefined;
      if (Array.isArray(labelsStore.value) || labelsStore.value === null) {
        return labelsStore.value;
      }
      if (typeof labelsStore.value === 'object') {
        return { ...(labelsStore.value as Record<string, string>) };
      }
      return labelsStore.value;
    }
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

  it('treats non-object config values as empty labels', async () => {
    const { getAllStoredAccountLabels, getStoredAccountLabel } =
      await import('./accountLabelStore.js');

    labelsStore.value = null;
    expect(getAllStoredAccountLabels()).toEqual({});
    labelsStore.value = ['not', 'object'];
    expect(getAllStoredAccountLabels()).toEqual({});
    labelsStore.value = { '0': 123, '1': 'Ok', '2': '  ' };
    expect(getStoredAccountLabel(0 as never)).toBeUndefined();
    expect(getStoredAccountLabel(1 as never)).toBe('Ok');
    expect(getStoredAccountLabel(2 as never)).toBeUndefined();
  });
});
