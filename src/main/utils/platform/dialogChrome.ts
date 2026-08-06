/**
 * Platform chrome defaults for auxiliary dialogs (About, Check for Updates).
 * Solid product canvas — no vibrancy so #0d1117 reads true on macOS.
 */

export const DIALOG_BACKGROUND_COLOR = '#0d1117' as const;

export type DialogChromeKind = 'about' | 'update';

export type PlatformDialogChrome = {
  readonly titleBarStyle?: 'hiddenInset';
  readonly backgroundColor: string;
  readonly trafficLightPosition?: { x: number; y: number };
};

/**
 * Platform-appropriate BrowserWindow chrome for About / Update dialogs.
 * Always safe to spread into constructor options.
 */
export function platformDialogChrome(kind: DialogChromeKind): PlatformDialogChrome {
  // kind reserved for future per-dialog tweaks; both share product canvas today.
  void kind;

  if (process.platform === 'darwin') {
    return {
      titleBarStyle: 'hiddenInset',
      backgroundColor: DIALOG_BACKGROUND_COLOR,
      trafficLightPosition: { x: 12, y: 12 },
    };
  }

  return {
    backgroundColor: DIALOG_BACKGROUND_COLOR,
  };
}
