/**
 * Build a canonical issue hash that retains the view.
 *
 * @param {'issues'|'epics'|'board'|'roadmap'} view - `roadmap` is the
 * throwaway prototype route (UI-r429).
 * @param {string} id
 */
export function issueHashFor(view, id) {
  const v =
    view === 'epics' || view === 'board' || view === 'roadmap'
      ? view
      : 'issues';
  return `#/${v}?issue=${encodeURIComponent(id)}`;
}
