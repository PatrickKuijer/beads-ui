/**
 * Deterministic accent color per epic id, shared by Board swimlanes,
 * Epics view cards, and the Detail epic panel.
 */

/** Deterministic accent palette for epic lane tiles/progress. */
export const EPIC_COLORS = [
  '#3794ff',
  '#c586c0',
  '#4ec990',
  '#e0983a',
  '#4fc1ff',
  '#b18aff',
  '#e01e1e',
  '#0f7dc4'
];

/**
 * Deterministic color for an epic id.
 *
 * @param {string} epic_id
 * @returns {string}
 */
export function colorForEpic(epic_id) {
  let hash = 0;
  for (let i = 0; i < epic_id.length; i++) {
    hash = (hash * 31 + epic_id.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % EPIC_COLORS.length;
  return EPIC_COLORS[idx];
}
