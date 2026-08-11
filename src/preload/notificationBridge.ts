import { ipcRenderer, webFrame } from 'electron';
import { IPC_CHANNELS } from '../shared/constants.js';
import { validateNotificationData } from '../shared/dataValidators.js';

const NOTIFICATION_SHOW_EVENT = '__gogchatNotificationShow';

const PAGE_WORLD_NOTIFICATION_BRIDGE = `(() => {
  const NativeNotification = window.Notification;
  if (!NativeNotification || window.__gogchatNotificationBridgeInstalled === true) return;
  window.__gogchatNotificationBridgeInstalled = true;

  let notificationIdCounter = 0;

  class GogChatNotification extends EventTarget {
    constructor(title, options = {}) {
      super();
      this.title = String(title);
      this.body = options.body || '';
      this.icon = options.icon || '';
      this.tag = options.tag || 'notification-' + notificationIdCounter++;
      this.data = options.data;
      this.dir = options.dir || 'auto';
      this.lang = options.lang || '';
      this.badge = options.badge || '';
      this.requireInteraction = options.requireInteraction || false;
      this.silent = options.silent || null;
      this.onclick = null;
      this.onclose = null;
      this.onerror = null;
      this.onshow = null;

      window.dispatchEvent(new CustomEvent('${NOTIFICATION_SHOW_EVENT}', {
        detail: {
          title: this.title,
          body: this.body,
          icon: this.icon,
          tag: this.tag,
        },
      }));

      setTimeout(() => {
        const event = new Event('show');
        this.dispatchEvent(event);
        if (this.onshow) this.onshow.call(this, event);
      }, 0);
    }

    close() {
      const event = new Event('close');
      this.dispatchEvent(event);
      if (this.onclose) this.onclose.call(this, event);
    }

    static requestPermission(callback) {
      return NativeNotification.requestPermission(callback);
    }

    static get permission() {
      return NativeNotification.permission;
    }
  }

  window.Notification = GogChatNotification;
})();`;

function forwardNotification(data: unknown): void {
  try {
    const validated = validateNotificationData(data);
    ipcRenderer.send(IPC_CHANNELS.NOTIFICATION_SHOW, {
      title: validated.title,
      ...(validated.body !== undefined && { body: validated.body }),
      ...(validated.icon !== undefined && { icon: validated.icon }),
      ...(validated.tag !== undefined && { tag: validated.tag }),
    });
  } catch (error: unknown) {
    console.error('[notificationBridge] Invalid notification data:', error);
  }
}

export function installNotificationBridge(): void {
  window.addEventListener(NOTIFICATION_SHOW_EVENT, (event) => {
    if (event instanceof CustomEvent) {
      forwardNotification(event.detail);
    }
  });

  void webFrame.executeJavaScript(PAGE_WORLD_NOTIFICATION_BRIDGE).catch((error: unknown) => {
    console.error('[notificationBridge] Failed to install page notification bridge:', error);
  });
}
