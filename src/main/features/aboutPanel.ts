/**
 * Platform-native About window — data: HTML, brand aurora, hide-cached.
 * Classic macOS About box: Esc / traffic lights dismiss (no Close button).
 */

import { BrowserWindow, app } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';
import log from 'electron-log';
import { APP_ICON_AURORA_CSS, appIconWithAuroraHtml } from '../../shared/appIconAurora.js';
import { escapeHtml } from '../../shared/escapeHtml.js';
import { validateExternalURL } from '../../shared/urlValidators.js';
import { getPackageInfo } from '../utils/platform/packageInfo.js';
import { DIALOG_BACKGROUND_COLOR, platformDialogChrome } from '../utils/platform/dialogChrome.js';
import { openExternal } from '../utils/security/shellWrapper.js';
import { registerMenuAction } from './menuActionRegistry.js';

/** Sentinel never loaded — reserved for future in-page dismiss wiring. */
const ABOUT_CLOSE_URL = 'https://gogchat.local/__about_close__';

let aboutWindow: BrowserWindow | null = null;

/** Escape a value for use inside a double-quoted HTML attribute. */
function escapeAttr(value: string): string {
  return escapeHtml(value);
}

/** Allow only https repository URLs for shell.openExternal. */
export function isSafeAboutRepositoryUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function resolveAppIconPath(): string {
  const relative = path.join('resources', 'icons', 'normal', 'scalable.svg');
  const candidates = [
    path.join(app.isPackaged ? process.resourcesPath : app.getAppPath(), relative),
    // Fallback: PNG when SVG missing (tests / incomplete resource trees)
    path.join(
      app.isPackaged ? process.resourcesPath : app.getAppPath(),
      'resources',
      'icons',
      'normal',
      '256.png'
    ),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0]!;
}

let iconDataUriCache: string | null = null;

function getAppIconDataUri(): string {
  if (iconDataUriCache !== null) {
    return iconDataUriCache;
  }
  const iconPath = resolveAppIconPath();
  try {
    const bytes = fs.readFileSync(iconPath);
    if (iconPath.endsWith('.svg')) {
      iconDataUriCache = `data:image/svg+xml,${encodeURIComponent(bytes.toString('utf-8'))}`;
    } else {
      iconDataUriCache = `data:image/png;base64,${bytes.toString('base64')}`;
    }
  } catch (error: unknown) {
    log.error('[About] Failed to load app icon:', error);
    // Transparent 1×1 PNG so the layout still renders.
    iconDataUriCache =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  }
  return iconDataUriCache;
}

function buildAboutHtml(): string {
  const packageJson = getPackageInfo();
  const platform = [os.type(), os.release(), os.arch()].join(', ');
  const productName = escapeHtml(packageJson.productName);
  const version = escapeHtml(app.getVersion());
  const author = escapeHtml(packageJson.author);
  const description = escapeHtml(packageJson.description);
  const platformSafe = escapeHtml(platform);
  const year = new Date().getFullYear();
  const rawRepo = packageJson.repository;
  const repoSafe = isSafeAboutRepositoryUrl(rawRepo) ? rawRepo : '';
  const repoAttr = escapeAttr(repoSafe);
  const repoHref =
    repoSafe.length > 0
      ? `href="${repoAttr}" target="_blank" rel="noopener noreferrer"`
      : `href="#" aria-disabled="true"`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="color-scheme" content="dark">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'none'; base-uri 'none'; form-action 'none'">
<title>About ${productName}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  :root {
    color-scheme: dark;
    --bg: ${DIALOG_BACKGROUND_COLOR};
    --text-primary: #f5f5f7;
    --text-secondary: #ebebf5;
    --text-tertiary: #98989d;
    --accent: #0a84ff;
    --edge: rgba(255, 255, 255, 0.08);
    --traffic-safe: 40px;
  }
  @media (prefers-contrast: more) {
    :root {
      --text-secondary: var(--text-primary);
      --text-tertiary: var(--text-primary);
    }
  }
  html, body { height: 100%; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, sans-serif;
    background: ${DIALOG_BACKGROUND_COLOR};
    color: var(--text-primary);
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 100vh;
    -webkit-app-region: drag;
    user-select: none;
    -webkit-user-select: none;
    -webkit-font-smoothing: antialiased;
    padding: var(--traffic-safe) 28px 16px;
    position: relative;
  }
  body::before {
    content: "";
    position: absolute;
    inset: 0 0 auto 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--edge), transparent);
    pointer-events: none;
  }
  .stage {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    margin-top: 8px;
    animation: about-in 0.28s cubic-bezier(0.23, 1, 0.32, 1) both;
  }
  @keyframes about-in {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @media (prefers-reduced-motion: reduce) {
    .stage { animation: none; }
  }
  ${APP_ICON_AURORA_CSS}
  .app-icon-aurora--about {
    margin-bottom: 18px;
  }
  h1 {
    font-size: 22px;
    font-weight: 600;
    letter-spacing: -0.025em;
    line-height: 1.15;
    margin-bottom: 6px;
    color: var(--text-primary);
  }
  .version {
    font-size: 12px;
    font-weight: 400;
    letter-spacing: 0.01em;
    color: var(--text-secondary);
    margin-bottom: 10px;
    line-height: 1.3;
  }
  .copyright {
    font-size: 11px;
    font-weight: 400;
    color: var(--text-tertiary);
    text-align: center;
    line-height: 1.45;
    letter-spacing: 0.01em;
    max-width: 260px;
    margin-bottom: 8px;
  }
  .blurb {
    font-size: 11px;
    font-weight: 400;
    color: var(--text-tertiary);
    text-align: center;
    line-height: 1.4;
    max-width: 260px;
    margin-bottom: 10px;
  }
  .plat {
    font-size: 10px;
    font-weight: 400;
    color: var(--text-tertiary);
    text-align: center;
    opacity: 0.85;
    margin-bottom: 12px;
    max-width: 260px;
  }
  .actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    -webkit-app-region: no-drag;
    width: 100%;
  }
  .repo-link {
    font-size: 12px;
    font-weight: 500;
    color: var(--accent);
    text-decoration: none;
    letter-spacing: -0.01em;
    padding: 4px 8px;
    border-radius: 6px;
    transition: opacity 0.12s ease-out, transform 0.1s ease-out;
  }
  .repo-link:hover { opacity: 0.85; }
  .repo-link:active { transform: scale(0.97); opacity: 0.75; }
  .repo-link:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .repo-link[aria-disabled="true"] {
    opacity: 0.4;
    pointer-events: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .repo-link { transition: none; }
    .repo-link:active { transform: none; }
  }
</style>
</head>
<body>
  <div class="stage">
    ${appIconWithAuroraHtml(getAppIconDataUri(), {
      size: 96,
      className: 'app-icon-aurora--about',
      // Raw product name — appIconWithAuroraHtml escapes attributes.
      alt: packageJson.productName,
    })}
    <h1>${productName}</h1>
    <p class="version">Version ${version}</p>
    <p class="copyright">Copyright © ${year} ${author}</p>
    <p class="blurb">${description}</p>
    <p class="plat">${platformSafe}</p>
    <div class="actions">
      <a class="repo-link" ${repoHref} aria-label="View ${productName} on GitHub (opens in browser)">GitHub</a>
    </div>
  </div>
</body>
</html>`;
}

function hideAboutWindow(win: BrowserWindow): void {
  if (!win.isDestroyed() && win.isVisible()) {
    win.hide();
  }
}

function presentAboutWindow(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  if (!win.isVisible()) {
    win.show();
  }
  // Window focus only — do not steal keyboard focus into the GitHub link.
  win.focus();
}

/**
 * Show the About window. First call builds data: HTML once; later calls
 * re-show the cached BrowserWindow (instant).
 */
export default function showAboutPanel(_mainWindow: BrowserWindow): void {
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    presentAboutWindow(aboutWindow);
    return;
  }

  const packageJson = getPackageInfo();
  const rawRepo = packageJson.repository;
  const repoSafe = isSafeAboutRepositoryUrl(rawRepo) ? rawRepo : '';
  const html = buildAboutHtml();
  const chrome = platformDialogChrome('about');

  const win = new BrowserWindow({
    width: 320,
    height: 400,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: false,
    center: true,
    show: false,
    title: `About ${packageJson.productName}`,
    ...chrome,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  win.setMenuBarVisibility(false);

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (repoSafe.length > 0 && url === repoSafe && isSafeAboutRepositoryUrl(url)) {
      try {
        const validated = validateExternalURL(url);
        void openExternal(validated).catch((err: unknown) => {
          log.error('[About] Failed to open repository URL:', err);
        });
      } catch (err: unknown) {
        log.error('[About] Rejected repository URL:', err);
      }
    }
    return { action: 'deny' };
  });

  const onNavigate = (event: { preventDefault: () => void; url: string }): void => {
    event.preventDefault();
    if (event.url === ABOUT_CLOSE_URL) {
      hideAboutWindow(win);
    }
  };
  win.webContents.on('will-navigate', onNavigate);
  win.webContents.on('will-frame-navigate', onNavigate);

  win.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      hideAboutWindow(win);
    }
  });

  // Hide-cache on OS close (traffic lights); real destroy only on quit/tests.
  win.on('close', (event) => {
    event.preventDefault();
    hideAboutWindow(win);
  });

  void win
    .loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    .catch((err: unknown) => {
      log.error('[About] Failed to load about window:', err);
    });

  win.once('ready-to-show', () => {
    if (win.isDestroyed()) return;
    presentAboutWindow(win);
  });

  win.on('closed', () => {
    if (aboutWindow === win) {
      aboutWindow = null;
    }
  });

  aboutWindow = win;
}

/**
 * Force-destroy the cached About window (shutdown / tests).
 * destroy() skips the cancelable "close" event used for hide-cache.
 */
export function destroyAboutWindow(): void {
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    aboutWindow.removeAllListeners('close');
    aboutWindow.destroy();
  }
  aboutWindow = null;
  iconDataUriCache = null;
}

registerMenuAction('aboutPanel', { label: 'Show About Panel', handler: showAboutPanel });
