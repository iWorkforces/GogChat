import { BrowserWindow } from 'electron';
import os from 'os';
import { getPackageInfo } from '../utils/platform/packageInfo.js';
import { registerMenuAction } from './menuActionRegistry.js';
import { getIconCache } from '../utils/platform/iconCache.js';
let aboutWindow: BrowserWindow | null = null;

/** Escape text for safe interpolation into HTML text nodes / attributes. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildAboutHtml(auraIconDataUrl: string): string {
  const packageJson = getPackageInfo();
  const platform = [os.type(), os.release(), os.arch()].join(', ');
  const productName = escapeHtml(packageJson.productName);
  const version = escapeHtml(packageJson.version);
  const author = escapeHtml(packageJson.author);
  const platformSafe = escapeHtml(platform);
  const iconSrc = escapeHtml(auraIconDataUrl);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>About GogChat</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #FFFFFF;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    -webkit-user-select: none;
    cursor: default;
  }
  .icon-wrap { margin-bottom: 16px; }
  .icon-wrap img { width: 128px; height: 128px; -webkit-user-drag: none; }
  .name { font-size: 18px; font-weight: 700; color: #202124; margin-bottom: 4px; }
  .ver { font-size: 13px; color: #5F6368; margin-bottom: 12px; }
  .copy { font-size: 12px; color: #80868B; margin-bottom: 2px; }
  .plat { font-size: 11px; color: #9AA0A6; margin-top: 16px; }
</style>
</head>
<body>
  <div class="icon-wrap"><img src="${iconSrc}" alt="GogChat" /></div>
  <div class="name">${productName}</div>
  <div class="ver">Version ${version}</div>
  <div class="copy">${author}</div>
  <div class="plat">${platformSafe}</div>
</body>
</html>`;
}

const focusAboutWindow = (window: BrowserWindow): void => {
  if (window.isMinimized()) window.restore();
  window.focus();
};

export default function showAboutPanel(mainWindow: BrowserWindow): void {
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    focusAboutWindow(aboutWindow);
    return;
  }

  // Load aura icon; fall back to normal icon if aura not generated yet
  const auraIcon = getIconCache().getIcon('resources/icons/aura/256.png');
  const iconDataUrl = auraIcon.isEmpty()
    ? getIconCache().getIcon('resources/icons/normal/256.png').toDataURL()
    : auraIcon.toDataURL();
  const html = buildAboutHtml(iconDataUrl);

  aboutWindow = new BrowserWindow({
    width: 360,
    height: 380,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    parent: mainWindow,
    center: true,
    show: false,
    title: 'About GogChat',
    backgroundColor: '#FFFFFF',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  aboutWindow.setAlwaysOnTop(true, 'floating');
  aboutWindow.setMenuBarVisibility(false);

  void aboutWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  aboutWindow.once('ready-to-show', () => {
    aboutWindow?.show();
  });

  aboutWindow.once('closed', () => {
    aboutWindow = null;
  });
}

registerMenuAction('aboutPanel', { label: 'Show About Panel', handler: showAboutPanel });
