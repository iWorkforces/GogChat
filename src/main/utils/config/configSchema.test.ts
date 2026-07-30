import { describe, expect, it } from 'vitest';

import { CACHE_VERSION, schema } from './configSchema.js';

describe('CACHE_VERSION', () => {
  it('is the string "1.0.0"', () => {
    expect(CACHE_VERSION).toBe('1.0.0');
    expect(typeof CACHE_VERSION).toBe('string');
  });
});

describe('schema structure', () => {
  it('has the expected top-level sections', () => {
    expect(Object.keys(schema).sort()).toEqual(
      ['_meta', 'accountWindows', 'app', 'memory', 'window'].sort()
    );
  });

  it.each(['window', 'app', '_meta', 'accountWindows', 'memory'] as const)(
    'section "%s" is an object with a default object',
    (key) => {
      const section = schema[key] as { type?: string; default?: unknown };
      expect(section.type).toBe('object');
      expect(typeof section.default).toBe('object');
      expect(section.default).not.toBeNull();
    }
  );
});

describe('window section', () => {
  const window = schema.window as {
    type: string;
    properties: {
      bounds: {
        type: string;
        properties: {
          x: { type: unknown };
          y: { type: unknown };
          width: { type: unknown };
          height: { type: unknown };
        };
        default: { x: unknown; y: unknown; width: number; height: number };
      };
      isMaximized: { type: string; default: boolean };
    };
    default: {
      bounds: { x: unknown; y: unknown; width: number; height: number };
      isMaximized: boolean;
    };
  };

  it('has bounds defaults { x: null, y: null, width: 800, height: 600 }', () => {
    expect(window.properties.bounds.default).toEqual({
      x: null,
      y: null,
      width: 800,
      height: 600,
    });
  });

  it('has isMaximized default false', () => {
    expect(window.properties.isMaximized.default).toBe(false);
    expect(window.properties.isMaximized.type).toBe('boolean');
  });

  it('bounds x and y types are ["number", "null"]', () => {
    expect(window.properties.bounds.properties.x.type).toEqual(['number', 'null']);
    expect(window.properties.bounds.properties.y.type).toEqual(['number', 'null']);
  });

  it('bounds width and height types are "number"', () => {
    expect(window.properties.bounds.properties.width.type).toBe('number');
    expect(window.properties.bounds.properties.height.type).toBe('number');
  });

  it('top-level window default matches nested structure', () => {
    expect(window.default).toEqual({
      bounds: { x: null, y: null, width: 800, height: 600 },
      isMaximized: false,
    });
  });
});

describe('app section', () => {
  const app = schema.app as {
    type: string;
    properties: Record<string, { type: string | string[]; default: unknown }>;
    default: Record<string, unknown>;
  };

  const expectedBooleanDefaults: Record<string, boolean> = {
    autoCheckForUpdates: true,
    autoLaunchAtLogin: true,
    startHidden: false,
    hideMenuBar: false,
    disableSpellChecker: false,
    suppressPasskeyDialog: false,
    notificationPermissionRequested: false,
    unreadDeltaNotifications: false,
    useWebContentsView: false,
  };

  it('includes boolean app flags and accountLabels object', () => {
    expect(Object.keys(app.properties).sort()).toEqual(
      [...Object.keys(expectedBooleanDefaults), 'accountLabels'].sort()
    );
    expect(app.properties['accountLabels']?.type).toBe('object');
    expect(app.default['accountLabels']).toEqual({});
  });

  it.each(Object.keys(expectedBooleanDefaults))('property "%s" is boolean', (key) => {
    expect(app.properties[key]?.type).toBe('boolean');
  });

  it.each(Object.entries(expectedBooleanDefaults))('property "%s" default is %s', (key, value) => {
    expect(app.properties[key]?.default).toBe(value);
    expect(app.default[key]).toBe(value);
  });
});

describe('_meta section', () => {
  const meta = schema._meta as {
    properties: {
      cacheVersion: { type: string; default: string };
      lastAppVersion: { type: string; default: string };
      lastUpdated: { type: string; default: number };
    };
    default: { cacheVersion: string; lastAppVersion: string; lastUpdated: number };
  };

  it('cacheVersion default matches CACHE_VERSION', () => {
    expect(meta.properties.cacheVersion.default).toBe(CACHE_VERSION);
    expect(meta.properties.cacheVersion.type).toBe('string');
    expect(meta.default.cacheVersion).toBe(CACHE_VERSION);
  });

  it('lastAppVersion default is empty string', () => {
    expect(meta.properties.lastAppVersion.default).toBe('');
    expect(meta.properties.lastAppVersion.type).toBe('string');
    expect(meta.default.lastAppVersion).toBe('');
  });

  it('lastUpdated property default is 0 and type is number', () => {
    expect(meta.properties.lastUpdated.default).toBe(0);
    expect(meta.properties.lastUpdated.type).toBe('number');
  });

  it('top-level default lastUpdated is a number (from Date.now())', () => {
    expect(typeof meta.default.lastUpdated).toBe('number');
    expect(meta.default.lastUpdated).toBeGreaterThanOrEqual(0);
  });
});

describe('accountWindows section', () => {
  const accountWindows = schema.accountWindows as {
    type: string;
    additionalProperties: {
      type: string;
      properties: {
        bounds: {
          type: string;
          properties: {
            x: { type: unknown };
            y: { type: unknown };
            width: { type: string };
            height: { type: string };
          };
          default: { x: unknown; y: unknown; width: number; height: number };
        };
        isMaximized: { type: string; default: boolean };
      };
      default: {
        bounds: { x: unknown; y: unknown; width: number; height: number };
        isMaximized: boolean;
      };
    };
    default: Record<string, unknown>;
  };

  it('has type "object"', () => {
    expect(accountWindows.type).toBe('object');
  });

  it('additionalProperties is an object with bounds + isMaximized', () => {
    expect(accountWindows.additionalProperties).toBeDefined();
    expect(accountWindows.additionalProperties.type).toBe('object');
    expect(Object.keys(accountWindows.additionalProperties.properties).sort()).toEqual(
      ['bounds', 'isMaximized'].sort()
    );
  });

  it('additionalProperties.bounds has x/y as ["number", "null"] and width/height as "number"', () => {
    const bounds = accountWindows.additionalProperties.properties.bounds;
    expect(bounds.properties.x.type).toEqual(['number', 'null']);
    expect(bounds.properties.y.type).toEqual(['number', 'null']);
    expect(bounds.properties.width.type).toBe('number');
    expect(bounds.properties.height.type).toBe('number');
    expect(bounds.default).toEqual({ x: null, y: null, width: 800, height: 600 });
  });

  it('additionalProperties.isMaximized defaults to false', () => {
    expect(accountWindows.additionalProperties.properties.isMaximized.type).toBe('boolean');
    expect(accountWindows.additionalProperties.properties.isMaximized.default).toBe(false);
  });

  it('default is an empty object', () => {
    expect(accountWindows.default).toEqual({});
  });
});
