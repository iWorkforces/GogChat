/**
 * Escape text for safe interpolation into HTML text nodes / attributes.
 * Pure string helper — no DOM. Safe for main (data: HTML) and shared callers.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
