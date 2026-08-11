import { webFrame } from 'electron';

/**
 * Disable WebAuthn/U2F to prevent authentication stuck issues
 *
 * Problem: GogChat tries to use U2F/WebAuthn for 2FA when it detects
 * browser support. However, Electron doesn't properly handle U2F prompts,
 * causing the app to get stuck at "checking your identity" screen.
 *
 * Solution: Remove navigator.credentials API to make Google think the browser
 * doesn't support WebAuthn. This forces Google to offer alternative 2FA methods
 * (Authenticator codes, SMS, etc.) that work properly in Electron.
 *
 * Reference: https://github.com/ankurk91/google-chat-electron/issues/16
 */

const PAGE_WORLD_DISABLE_WEBAUTHN = `(() => {
  try {
    Object.defineProperty(navigator, 'credentials', {
      get: () => undefined,
      configurable: true,
    });
  } catch (error) {
    try {
      Object.defineProperty(Navigator.prototype, 'credentials', {
        get: () => undefined,
        configurable: true,
      });
    } catch (_) {
      /* page-world override failed; isolated-world attempt still applies */
    }
  }
})();`;

function disableIsolatedNavigator(): void {
  if (typeof navigator === 'undefined') {
    return;
  }
  try {
    Object.defineProperty(navigator, 'credentials', {
      value: undefined,
      writable: false,
      configurable: false,
    });
    console.log('[Preload] WebAuthn/U2F disabled via property override');
  } catch (e: unknown) {
    console.warn('[Preload] Failed to disable WebAuthn/U2F:', e);
  }
}

// Isolated-world navigator is not the page navigator under contextIsolation.
// Inject the same override into page world so Google scripts observe it.
export function installDisableWebAuthn(): void {
  disableIsolatedNavigator();
  if (webFrame && typeof webFrame.executeJavaScript === 'function') {
    void webFrame.executeJavaScript(PAGE_WORLD_DISABLE_WEBAUTHN).catch((error: unknown) => {
      console.warn('[Preload] Page-world WebAuthn disable failed:', error);
    });
  }
}
