/**
 * Modal dialog to edit a single multi-account notification label.
 * Uses a small sandboxed BrowserWindow + executeJavaScript Promise (no preload).
 */

import { BrowserWindow } from 'electron';
import log from 'electron-log';
import { ACCOUNT_LABEL } from '../../../shared/constants.js';
import { sanitizeAccountLabelInput } from './accountLabelStore.js';

function buildDialogHtml(accountNumber: number, currentLabel: string, maxLength: number): string {
  const safeCurrent = currentLabel
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Account Label</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      margin: 0; padding: 16px 18px;
      background: #f5f5f7; color: #1d1d1f;
      user-select: none;
    }
    h1 { font-size: 14px; font-weight: 600; margin: 0 0 6px; }
    p { font-size: 12px; color: #6e6e73; margin: 0 0 12px; line-height: 1.35; }
    label { display: block; font-size: 12px; margin-bottom: 4px; }
    input {
      width: 100%; padding: 8px 10px; font-size: 13px;
      border: 1px solid #d2d2d7; border-radius: 6px; outline: none;
    }
    input:focus { border-color: #0071e3; box-shadow: 0 0 0 3px rgba(0,113,227,0.2); }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
    button {
      font-size: 13px; padding: 6px 14px; border-radius: 6px; border: none; cursor: pointer;
    }
    #cancel { background: #e8e8ed; color: #1d1d1f; }
    #save { background: #0071e3; color: #fff; }
    #clear { background: transparent; color: #0071e3; margin-right: auto; }
  </style>
</head>
<body>
  <h1>Label for Account ${accountNumber}</h1>
  <p>Shown as the subtitle on native notifications for this account. Leave empty to use the default “Account ${accountNumber}”.</p>
  <label for="label">Custom label</label>
  <input id="label" type="text" maxlength="${maxLength}" value="${safeCurrent}" autofocus />
  <div class="actions">
    <button type="button" id="clear">Clear</button>
    <button type="button" id="cancel">Cancel</button>
    <button type="button" id="save">Save</button>
  </div>
</body>
</html>`;
}

/**
 * Prompt the user for an account label. Returns:
 * - trimmed string to store
 * - empty string if user chose Clear
 * - null if cancelled / closed
 */
export async function promptAccountLabel(
  parent: BrowserWindow,
  accountIndex: number,
  currentLabel: string
): Promise<string | null> {
  const accountNumber = accountIndex + 1;
  const win = new BrowserWindow({
    parent,
    modal: true,
    width: 400,
    height: 220,
    resizable: false,
    minimizable: false,
    maximizable: false,
    show: false,
    title: `Account ${accountNumber} Label`,
    backgroundColor: '#f5f5f7',
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  try {
    const html = buildDialogHtml(accountNumber, currentLabel, ACCOUNT_LABEL.MAX_LENGTH);
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    if (!win.isDestroyed()) {
      win.show();
      win.focus();
    }

    const result: unknown = await win.webContents.executeJavaScript(
      `new Promise((resolve) => {
        const input = document.getElementById('label');
        const finish = (value) => resolve(value);
        document.getElementById('save').onclick = () => finish(input.value);
        document.getElementById('clear').onclick = () => finish('');
        document.getElementById('cancel').onclick = () => finish(null);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') finish(input.value);
          if (e.key === 'Escape') finish(null);
        });
        window.addEventListener('beforeunload', () => finish(null));
      })`,
      true
    );

    if (result === null || result === undefined) {
      return null;
    }
    if (typeof result !== 'string') {
      return null;
    }
    return sanitizeAccountLabelInput(result);
  } catch (error: unknown) {
    log.error('[AccountLabelDialog] Failed to collect label:', error);
    return null;
  } finally {
    if (!win.isDestroyed()) {
      win.close();
    }
  }
}
