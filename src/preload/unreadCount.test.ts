// @vitest-environment jsdom

/**
 * Tests for unreadCount preload script
 * Verifies scoped MutationObserver setup, debounced IPC emission, and cleanup
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('electron', () => ({
  ipcRenderer: { send: vi.fn(), on: vi.fn(), removeListener: vi.fn() },
}));
import { SELECTORS } from '../shared/constants.js';

// Capture event listeners registered on window
type EventListenerEntry = { type: string; handler: EventListener };
let windowListeners: EventListenerEntry[] = [];

// Track each MutationObserver instance and where it was attached
type ObserverRecord = {
  callback: MutationCallback;
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  targets: Array<{ target: Element; options: Record<string, unknown> }>;
};
let observers: ObserverRecord[] = [];

class MockMutationObserver {
  callback: MutationCallback;
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  targets: Array<{ target: Element; options: Record<string, unknown> }> = [];

  constructor(callback: MutationCallback) {
    this.callback = callback;
    this.observe = vi.fn((target: Element, options: Record<string, unknown>) => {
      this.targets.push({ target, options });
    });
    this.disconnect = vi.fn();
    observers.push({
      callback: this.callback,
      observe: this.observe,
      disconnect: this.disconnect,
      targets: this.targets,
    });
  }
}

const mockSendUnreadCount = vi.fn();

const findBodyObserver = () =>
  observers.find((o) => o.targets.some((t) => t.target === document.body));

const findContainerObservers = () =>
  observers.filter((o) => o.targets.some((t) => t.target !== document.body));

describe('unreadCount', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();

    windowListeners = [];
    observers = [];
    mockSendUnreadCount.mockClear();

    vi.stubGlobal('MutationObserver', MockMutationObserver);

    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });

    // Default: no containers in DOM
    vi.spyOn(document, 'querySelectorAll').mockReturnValue([] as unknown as NodeListOf<Element>);

    Object.defineProperty(window, 'gogchat', {
      value: { sendUnreadCount: mockSendUnreadCount },
      configurable: true,
      writable: true,
    });

    const originalAddEventListener = window.addEventListener.bind(window);
    vi.spyOn(window, 'addEventListener').mockImplementation(
      (type: string, handler: EventListenerOrEventListenerObject) => {
        windowListeners.push({ type, handler: handler as EventListener });
        originalAddEventListener(type, handler);
      }
    );

    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    for (const { type, handler } of windowListeners) {
      window.removeEventListener(type, handler);
    }
  });

  const fireDOMContentLoaded = () => {
    const handler = windowListeners.find((l) => l.type === 'DOMContentLoaded');
    handler!.handler(new Event('DOMContentLoaded'));
  };

  it('registers DOMContentLoaded, visibilitychange, and beforeunload listeners', async () => {
    const { installUnreadCount } = await import('./unreadCount');
    installUnreadCount();
    const types = windowListeners.map((l) => l.type);
    expect(types).toContain('DOMContentLoaded');
    expect(types).toContain('visibilitychange');
    expect(types).toContain('beforeunload');
  });

  it('attaches a body-level observer with childList+subtree only (no characterData)', async () => {
    const { installUnreadCount } = await import('./unreadCount');
    installUnreadCount();
    fireDOMContentLoaded();

    const body = findBodyObserver();
    expect(body).toBeDefined();
    const opts = body!.targets.find((t) => t.target === document.body)!.options;
    expect(opts.childList).toBe(true);
    expect(opts.subtree).toBe(true);
    expect(opts.characterData).toBeFalsy();
    expect(opts.attributes).toBeFalsy();
  });

  it('attaches a scoped observer to each .RuSDjb container with badge-aware options', async () => {
    const container = document.createElement('div');
    container.className = 'RuSDjb';
    document.body.appendChild(container);

    vi.spyOn(document, 'querySelectorAll').mockImplementation((sel: string) => {
      if (sel === SELECTORS.UNREAD_BADGE_CONTAINER) {
        return [container] as unknown as NodeListOf<Element>;
      }
      return [] as unknown as NodeListOf<Element>;
    });

    const { installUnreadCount } = await import('./unreadCount');
    installUnreadCount();
    fireDOMContentLoaded();

    const containerObservers = findContainerObservers();
    expect(containerObservers.length).toBeGreaterThanOrEqual(1);

    const containerEntry = containerObservers[0]!.targets.find((t) => t.target === container);
    expect(containerEntry).toBeDefined();
    expect(containerEntry!.options.childList).toBe(true);
    expect(containerEntry!.options.characterData).toBe(true);
    expect(containerEntry!.options.attributes).toBe(true);
    expect(containerEntry!.options.attributeFilter).toEqual(['aria-label', 'aria']);
  });

  it('sends unread count 0 on initial observation when no badges found', async () => {
    const { installUnreadCount } = await import('./unreadCount');
    installUnreadCount();
    fireDOMContentLoaded();
    expect(mockSendUnreadCount).toHaveBeenCalledWith(0);
  });

  it('extracts unread count from DOM badges via aria-label', async () => {
    const badge1 = {
      getAttribute: (attr: string) => (attr === 'aria-label' ? '3 unread messages' : ''),
      textContent: '3',
    };
    const container1 = {
      querySelector: (sel: string) => (sel === SELECTORS.UNREAD_BADGE ? badge1 : null),
    };
    const badge2 = {
      getAttribute: (attr: string) => (attr === 'aria-label' ? '5 unread messages' : ''),
      textContent: '5',
    };
    const container2 = {
      querySelector: (sel: string) => (sel === SELECTORS.UNREAD_BADGE ? badge2 : null),
    };

    vi.spyOn(document, 'querySelectorAll').mockReturnValue([
      container1,
      container2,
    ] as unknown as NodeListOf<Element>);

    const { installUnreadCount } = await import('./unreadCount');
    installUnreadCount();
    fireDOMContentLoaded();

    expect(mockSendUnreadCount).toHaveBeenCalledWith(8);
  });

  it('uses alt badge selector when primary not found', async () => {
    const altBadge = {
      getAttribute: (attr: string) => (attr === 'aria-label' ? '2 unread' : ''),
      textContent: '2',
    };
    const container = {
      querySelector: (sel: string) => (sel === SELECTORS.UNREAD_BADGE_ALT ? altBadge : null),
    };

    vi.spyOn(document, 'querySelectorAll').mockReturnValue([
      container,
    ] as unknown as NodeListOf<Element>);

    const { installUnreadCount } = await import('./unreadCount');
    installUnreadCount();
    fireDOMContentLoaded();

    expect(mockSendUnreadCount).toHaveBeenCalledWith(2);
  });

  it('does not send when count has not changed', async () => {
    const { installUnreadCount } = await import('./unreadCount');
    installUnreadCount();
    fireDOMContentLoaded();

    expect(mockSendUnreadCount).toHaveBeenCalledTimes(1);

    const visHandler = windowListeners.find((l) => l.type === 'visibilitychange');
    visHandler!.handler(new Event('visibilitychange'));

    expect(mockSendUnreadCount).toHaveBeenCalledTimes(1);
  });

  it('debounces badge-only mutations from the container observer with 200ms delay', async () => {
    const badge = {
      getAttribute: () => '1 unread',
      textContent: '1',
    };
    const container = {
      querySelector: (sel: string) => (sel === SELECTORS.UNREAD_BADGE ? badge : null),
    };

    // Start: container is present but badge has no count yet
    const emptyBadge = {
      getAttribute: () => '0 unread',
      textContent: '0',
    };
    const initialContainer = {
      querySelector: (sel: string) => (sel === SELECTORS.UNREAD_BADGE ? emptyBadge : null),
    };

    let stage: 'initial' | 'updated' = 'initial';
    vi.spyOn(document, 'querySelectorAll').mockImplementation((sel: string) => {
      if (sel === SELECTORS.UNREAD_BADGE_CONTAINER) {
        const c = stage === 'initial' ? initialContainer : container;
        return [c] as unknown as NodeListOf<Element>;
      }
      return [] as unknown as NodeListOf<Element>;
    });

    const { installUnreadCount } = await import('./unreadCount');
    installUnreadCount();
    fireDOMContentLoaded();

    // Initial emit: count=0
    expect(mockSendUnreadCount).toHaveBeenCalledTimes(1);
    expect(mockSendUnreadCount).toHaveBeenLastCalledWith(0);

    // Now flip the badge text. Fire the SCOPED container observer (not body).
    stage = 'updated';
    const containerObservers = findContainerObservers();
    expect(containerObservers.length).toBeGreaterThan(0);
    const scoped = containerObservers[0]!;
    scoped.callback([] as unknown as MutationRecord[], {} as MutationObserver);
    scoped.callback([] as unknown as MutationRecord[], {} as MutationObserver);
    scoped.callback([] as unknown as MutationRecord[], {} as MutationObserver);

    // Debounce not yet elapsed
    expect(mockSendUnreadCount).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(200);

    expect(mockSendUnreadCount).toHaveBeenCalledTimes(2);
    expect(mockSendUnreadCount).toHaveBeenLastCalledWith(1);
  });

  it('does not emit when unrelated body subtree mutations fire and DOM is unchanged', async () => {
    const { installUnreadCount } = await import('./unreadCount');
    installUnreadCount();
    fireDOMContentLoaded();

    // Initial: count=0
    expect(mockSendUnreadCount).toHaveBeenCalledTimes(1);

    // An unrelated body mutation triggers the body observer (e.g. Google Chat
    // re-rendering some other UI). Container set is unchanged and count is
    // still 0, so no new IPC emit should happen.
    const body = findBodyObserver()!;
    body.callback([] as unknown as MutationRecord[], {} as MutationObserver);

    vi.advanceTimersByTime(200);

    // Still only the initial emit — count didn't change
    expect(mockSendUnreadCount).toHaveBeenCalledTimes(1);
  });

  it('handles container removal and re-insertion correctly', async () => {
    // Stage 1: container with badge value 4
    const badgeA = {
      getAttribute: () => '4 unread',
      textContent: '4',
    };
    const containerA = document.createElement('div');
    containerA.className = 'RuSDjb';
    document.body.appendChild(containerA);
    (containerA as unknown as { querySelector: (s: string) => unknown }).querySelector = (
      sel: string
    ) => (sel === SELECTORS.UNREAD_BADGE ? badgeA : null);

    let presentContainers: Element[] = [containerA];
    vi.spyOn(document, 'querySelectorAll').mockImplementation((sel: string) => {
      if (sel === SELECTORS.UNREAD_BADGE_CONTAINER) {
        return presentContainers as unknown as NodeListOf<Element>;
      }
      return [] as unknown as NodeListOf<Element>;
    });

    const { installUnreadCount } = await import('./unreadCount');
    installUnreadCount();
    fireDOMContentLoaded();

    expect(mockSendUnreadCount).toHaveBeenLastCalledWith(4);

    const initialContainerObservers = findContainerObservers();
    expect(initialContainerObservers.length).toBe(1);
    const firstScoped = initialContainerObservers[0]!;

    // Stage 2: container is removed from DOM
    document.body.removeChild(containerA);
    presentContainers = [];

    // Body observer fires on the removal
    const body = findBodyObserver()!;
    body.callback([] as unknown as MutationRecord[], {} as MutationObserver);

    // Old container observer should have been disconnected
    expect(firstScoped.disconnect).toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    // Count went from 4 → 0 → emit
    expect(mockSendUnreadCount).toHaveBeenLastCalledWith(0);

    // Stage 3: a new container is inserted
    const badgeB = {
      getAttribute: () => '7 unread',
      textContent: '7',
    };
    const containerB = document.createElement('div');
    containerB.className = 'RuSDjb';
    document.body.appendChild(containerB);
    (containerB as unknown as { querySelector: (s: string) => unknown }).querySelector = (
      sel: string
    ) => (sel === SELECTORS.UNREAD_BADGE ? badgeB : null);
    presentContainers = [containerB];

    body.callback([] as unknown as MutationRecord[], {} as MutationObserver);

    // A new scoped observer should be attached to containerB
    const allContainerObservers = findContainerObservers();
    const observerForB = allContainerObservers.find((o) =>
      o.targets.some((t) => t.target === containerB)
    );
    expect(observerForB).toBeDefined();

    vi.advanceTimersByTime(200);
    expect(mockSendUnreadCount).toHaveBeenLastCalledWith(7);
  });

  it('disconnects all observers and clears timer on beforeunload', async () => {
    const container = document.createElement('div');
    container.className = 'RuSDjb';
    document.body.appendChild(container);

    vi.spyOn(document, 'querySelectorAll').mockImplementation((sel: string) => {
      if (sel === SELECTORS.UNREAD_BADGE_CONTAINER) {
        return [container] as unknown as NodeListOf<Element>;
      }
      return [] as unknown as NodeListOf<Element>;
    });

    const { installUnreadCount } = await import('./unreadCount');
    installUnreadCount();
    fireDOMContentLoaded();

    // Trigger a scoped mutation to start the debounce timer
    const scoped = findContainerObservers()[0]!;
    scoped.callback([] as unknown as MutationRecord[], {} as MutationObserver);

    const buHandler = windowListeners.find((l) => l.type === 'beforeunload');
    buHandler!.handler(new Event('beforeunload'));

    expect(findBodyObserver()!.disconnect).toHaveBeenCalled();
    expect(scoped.disconnect).toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    // Only initial emit (count=0, prev=-1)
    expect(mockSendUnreadCount).toHaveBeenCalledTimes(1);
  });

  it('emits count on visibilitychange', async () => {
    const badge = {
      getAttribute: () => '4 unread',
      textContent: '4',
    };
    const container = {
      querySelector: (sel: string) => (sel === SELECTORS.UNREAD_BADGE ? badge : null),
    };

    vi.spyOn(document, 'querySelectorAll').mockReturnValue([
      container,
    ] as unknown as NodeListOf<Element>);

    const { installUnreadCount } = await import('./unreadCount');
    installUnreadCount();
    fireDOMContentLoaded();

    expect(mockSendUnreadCount).toHaveBeenCalledWith(4);
  });

  it('does not call sendUnreadCount when gogchat API is unavailable', async () => {
    Object.defineProperty(window, 'gogchat', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const { installUnreadCount } = await import('./unreadCount');
    installUnreadCount();
    fireDOMContentLoaded();

    expect(mockSendUnreadCount).not.toHaveBeenCalled();
  });

  it('ignores badges without "unread" in aria-label', async () => {
    const badge = {
      getAttribute: () => 'some other label',
      textContent: '7',
    };
    const container = {
      querySelector: (sel: string) => (sel === SELECTORS.UNREAD_BADGE ? badge : null),
    };

    vi.spyOn(document, 'querySelectorAll').mockReturnValue([
      container,
    ] as unknown as NodeListOf<Element>);

    const { installUnreadCount } = await import('./unreadCount');
    installUnreadCount();
    fireDOMContentLoaded();

    expect(mockSendUnreadCount).toHaveBeenCalledWith(0);
  });

  it('ignores badges with non-numeric text content', async () => {
    const badge = {
      getAttribute: () => 'unread messages',
      textContent: 'many',
    };
    const container = {
      querySelector: (sel: string) => (sel === SELECTORS.UNREAD_BADGE ? badge : null),
    };

    vi.spyOn(document, 'querySelectorAll').mockReturnValue([
      container,
    ] as unknown as NodeListOf<Element>);

    const { installUnreadCount } = await import('./unreadCount');
    installUnreadCount();
    fireDOMContentLoaded();

    expect(mockSendUnreadCount).toHaveBeenCalledWith(0);
  });

  it('disconnects previous observers when initObserver is called again', async () => {
    const { installUnreadCount } = await import('./unreadCount');
    installUnreadCount();
    fireDOMContentLoaded();

    const firstBody = findBodyObserver();
    expect(firstBody).toBeDefined();

    fireDOMContentLoaded();

    expect(firstBody!.disconnect).toHaveBeenCalled();
    // A second body observer was created
    const allBodyObservers = observers.filter((o) =>
      o.targets.some((t) => t.target === document.body)
    );
    expect(allBodyObservers.length).toBeGreaterThanOrEqual(2);
  });

  it('degrades gracefully if querySelectorAll throws', async () => {
    vi.spyOn(document, 'querySelectorAll').mockImplementation(() => {
      throw new Error('invalid selector');
    });

    const { installUnreadCount } = await import('./unreadCount');
    installUnreadCount();

    // Should not throw on init
    expect(() => fireDOMContentLoaded()).not.toThrow();
    // count=0 emitted (defaults)
    expect(mockSendUnreadCount).toHaveBeenCalledWith(0);
  });
});
