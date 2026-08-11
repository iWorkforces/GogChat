// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockSend = vi.fn();
const mockExecuteJavaScript = vi.fn().mockResolvedValue(undefined);

vi.mock('electron', () => ({
  ipcRenderer: {
    send: mockSend,
  },
  webFrame: {
    executeJavaScript: mockExecuteJavaScript,
  },
}));

vi.mock('../shared/dataValidators.js', () => ({
  validateNotificationData: vi.fn((data: unknown) => data),
}));

describe('notificationBridge', () => {
  beforeEach(() => {
    vi.resetModules();
    mockSend.mockClear();
    mockExecuteJavaScript.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('forwards page-world Notification construction to native notification IPC', async () => {
    const { installNotificationBridge } = await import('./notificationBridge.js');
    installNotificationBridge();

    window.dispatchEvent(
      new window.CustomEvent('__gogchatNotificationShow', {
        detail: {
          title: 'Alice',
          body: 'New message',
          icon: 'https://example.com/icon.png',
          tag: 'chat-message-1',
        },
      })
    );

    expect(mockSend).toHaveBeenCalledWith('notificationShow', {
      title: 'Alice',
      body: 'New message',
      icon: 'https://example.com/icon.png',
      tag: 'chat-message-1',
    });
  });

  it('installs the page-world Notification bridge through webFrame', async () => {
    const { installNotificationBridge } = await import('./notificationBridge.js');
    installNotificationBridge();

    expect(mockExecuteJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('GogChatNotification')
    );
  });

  it('rejects invalid notification payloads before IPC', async () => {
    const { validateNotificationData } = await import('../shared/dataValidators.js');
    vi.mocked(validateNotificationData).mockImplementation(() => {
      throw new Error('Invalid notification');
    });

    const { installNotificationBridge } = await import('./notificationBridge.js');
    installNotificationBridge();

    window.dispatchEvent(
      new window.CustomEvent('__gogchatNotificationShow', {
        detail: {
          title: '<script>',
        },
      })
    );

    expect(mockSend).not.toHaveBeenCalled();
  });
});
