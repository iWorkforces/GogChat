import { afterEach, describe, expect, it } from 'vitest';
import { DIALOG_BACKGROUND_COLOR, platformDialogChrome } from './dialogChrome.js';

describe('platformDialogChrome', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('returns hiddenInset chrome on darwin', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    expect(platformDialogChrome('about')).toEqual({
      titleBarStyle: 'hiddenInset',
      backgroundColor: DIALOG_BACKGROUND_COLOR,
      trafficLightPosition: { x: 12, y: 12 },
    });
  });

  it('returns a solid canvas without traffic lights off darwin', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    expect(platformDialogChrome('update')).toEqual({
      backgroundColor: DIALOG_BACKGROUND_COLOR,
    });
  });
});
