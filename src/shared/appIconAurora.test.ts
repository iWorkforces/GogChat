/**
 * Unit tests for app-icon aurora pure CSS/HTML helpers.
 */
import { describe, it, expect } from 'vitest';
import {
  APP_ICON_AURORA_COLORS,
  APP_ICON_AURORA_CSS,
  appIconWithAuroraHtml,
} from './appIconAurora.js';

describe('appIconAurora', () => {
  it('exports brand palette aligned with Chat blue', () => {
    expect(APP_ICON_AURORA_COLORS.blue).toBe('#4285F4');
    expect(APP_ICON_AURORA_COLORS.green).toBe('#34A853');
  });

  it('CSS includes about-tier fancy motion and reduced-motion guards', () => {
    expect(APP_ICON_AURORA_CSS).toContain('.app-icon-aurora--about');
    expect(APP_ICON_AURORA_CSS).toContain('app-icon-aurora-bloom-in');
    expect(APP_ICON_AURORA_CSS).toContain('prefers-reduced-motion');
    expect(APP_ICON_AURORA_CSS).toContain('prefers-reduced-transparency');
  });

  it('builds markup with size, class, and escaped src', () => {
    const html = appIconWithAuroraHtml('data:image/svg+xml,%3Csvg%3E', {
      size: 96,
      className: 'app-icon-aurora--about',
      alt: 'GogChat',
    });
    expect(html).toContain('app-icon-aurora--about');
    expect(html).toContain('--icon-size: 96px');
    expect(html).toContain('app-icon-aurora__blob--core');
    expect(html).toContain('app-icon-aurora__sheen');
    expect(html).toContain('app-icon-aurora__flare');
    expect(html).toContain('alt="GogChat"');
    expect(html).toContain('src="data:image/svg+xml,%3Csvg%3E"');
  });

  it('escapes attribute breakouts in icon src and alt', () => {
    const html = appIconWithAuroraHtml('x" onerror="alert(1)', {
      alt: 'a"b',
    });
    expect(html).toContain('src="x&quot; onerror=&quot;alert(1)"');
    expect(html).toContain('alt="a&quot;b"');
    expect(html).not.toContain('onerror="alert');
  });

  it('marks decorative icons aria-hidden when alt omitted', () => {
    const html = appIconWithAuroraHtml('data:image/png;base64,AA');
    expect(html).toContain('aria-hidden="true"');
  });
});
