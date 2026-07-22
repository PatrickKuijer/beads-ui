/**
 * Compact icon-only glyph for an issue type (matches mock's 34px icon cell).
 */

const ICONS = {
  bug: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M5 6a3 3 0 0 1 6 0v3a3 3 0 0 1-6 0z" fill="currentColor" fill-opacity=".15"/><path d="M8 3.5V2M5.5 5L4 3.8M10.5 5L12 3.8M5 8H2.5M11 8h2.5M5.4 10.5L4 11.6M10.6 10.5L12 11.6"/></svg>',
  feature:
    '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1.2l1.7 4 4.3.3-3.3 2.8 1 4.2L8 10.4 4.3 12.5l1-4.2L2 5.5l4.3-.3z"/></svg>',
  task: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2.5" y="2.5" width="11" height="11" rx="2.5"/><path d="M5 8l2 2 4-4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  epic: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M8 2l5.5 3L8 8 2.5 5z" fill="currentColor" fill-opacity=".18"/><path d="M2.5 8L8 11l5.5-3M2.5 11L8 14l5.5-3"/></svg>',
  chore:
    '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2.5l1 2 2.2.4-1.5 1.7.3 2.2-2-1-2 1 .3-2.2L6 4.9l2.2-.4z"/><path d="M4 9.5l1.2 1.2M9.5 9.5l-1.2 1.2M4 13.5h2M9.5 13.5h2"/></svg>'
};

/**
 * Create an icon-only cell content for an issue type. No text label, no
 * pill chrome — a bare colored glyph, matching the mock's 34px type column.
 *
 * @param {string | undefined | null} issue_type - One of: bug, feature, task, epic, chore
 * @returns {HTMLSpanElement}
 */
export function createTypeIcon(issue_type) {
  const el = document.createElement('span');
  const t = /** @type {keyof typeof ICONS} */ (
    (issue_type || '').toString().toLowerCase()
  );
  const known = Object.prototype.hasOwnProperty.call(ICONS, t) ? t : null;
  el.className = `type-icon${known ? ` type-icon--${known}` : ''}`;
  el.setAttribute('role', 'img');
  const label = known
    ? known.charAt(0).toUpperCase() + known.slice(1)
    : 'Unknown';
  el.setAttribute('aria-label', `Issue type: ${label}`);
  el.setAttribute('title', `Type: ${label}`);
  el.innerHTML = known ? ICONS[known] : ICONS.task;
  return el;
}
