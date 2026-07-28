import { html, render } from 'lit-html';
import { cmpPriorityThenCreated } from '../data/sort.js';
import { colorForEpic } from '../utils/epic-color.js';
import { createIssueIdRenderer } from '../utils/issue-id-renderer.js';
import { createPriorityBadge } from '../utils/priority-badge.js';
import { statusLabel } from '../utils/status.js';
import { createTypeIcon } from '../utils/type-icon.js';

/**
 * @typedef {{ id: string, title?: string, status?: 'open'|'in_progress'|'closed', priority?: number, issue_type?: string, epic_id?: string | null, created_at?: number, updated_at?: number }} IssueLite
 */

/**
 * @typedef {{ epic: IssueLite, color: string, blocked: number, ready: number, wip: number, closed: number, total: number, children: IssueLite[] }} EpicGroup
 */

/**
 * Epics view (push-only):
 * - Epic entities come from `tab:epics` (all statuses — bd list --type=epic).
 * - Blocked/ready/wip/closed rollups and child rows are derived from the same
 *   four status-list subscriptions Board swimlanes use
 *   (`tab:epics:blocked|ready|in-progress|closed`), grouped by `epic_id` —
 *   not from bd's per-epic counters or a per-epic issue-detail fetch, so
 *   there's no risk of a dependents-array cap hiding children.
 *
 * @param {HTMLElement} mount_element
 * @param {unknown} _data - Unused; retained for call-site compatibility.
 * @param {(id: string) => void} goto_issue - Navigate to issue detail.
 * @param {{ getState: () => any, setState: (patch: any) => void, subscribe?: (fn: (s:any)=>void)=>()=>void }} [store] - Optional shared state store (header search/priority filters).
 * @param {unknown} [_subscriptions] - Unused; retained for call-site compatibility.
 * @param {{ snapshotFor?: (client_id: string) => any[], subscribe?: (fn: () => void) => () => void }} [issue_stores]
 */
export function createEpicsView(
  mount_element,
  _data,
  goto_issue,
  store = undefined,
  _subscriptions = undefined,
  issue_stores = undefined
) {
  // Signature retained for call-site compatibility with main.js; no longer
  // used now that epic children come from the four status-list stores.
  void _subscriptions;
  /** @type {EpicGroup[]} */
  let all_groups = [];
  /** @type {EpicGroup[]} */
  let groups = [];
  /** @type {Set<string>} */
  const expanded = new Set();

  /**
   * Current id/title search text from the shared header search box.
   *
   * @returns {string}
   */
  function searchText() {
    if (!store) {
      return '';
    }
    try {
      const s = store.getState();
      return String(s?.filters?.search || '').toLowerCase();
    } catch {
      return '';
    }
  }

  /**
   * Current priority filter from the shared header prio chips.
   *
   * @returns {number[]}
   */
  function prioFilter() {
    if (!store) {
      return [0, 1, 2, 3];
    }
    try {
      const s = store.getState();
      return Array.isArray(s?.filters?.prio) ? s.filters.prio : [0, 1, 2, 3];
    } catch {
      return [0, 1, 2, 3];
    }
  }

  /**
   * Current hide-closed toggle from the shared header control.
   *
   * @returns {boolean}
   */
  function hideClosed() {
    if (!store) {
      return false;
    }
    try {
      const s = store.getState();
      return s?.filters?.hideClosed === true;
    } catch {
      return false;
    }
  }

  /**
   * Apply the shared header search/priority/hide-closed filters to a list
   * of epic groups (top-level epics only; does not touch expanded children).
   *
   * @param {EpicGroup[]} list
   * @returns {EpicGroup[]}
   */
  function applyFilters(list) {
    let filtered = list;
    const needle = searchText();
    if (needle) {
      filtered = filtered.filter((g) => {
        const epic = g.epic || {};
        const a = String(epic.id || '').toLowerCase();
        const b = String(epic.title || '').toLowerCase();
        return a.includes(needle) || b.includes(needle);
      });
    }
    const prio = prioFilter();
    if (prio.length < 4) {
      filtered = filtered.filter((g) =>
        prio.includes(Number(g.epic?.priority))
      );
    }
    if (hideClosed()) {
      filtered = filtered.filter(
        (g) => String(g.epic?.status || '') !== 'closed'
      );
    }
    return filtered;
  }

  /** Recompute the filtered `groups` from the current `all_groups`. */
  function recomputeGroups() {
    groups = applyFilters(all_groups);
  }

  // Live re-render on pushes: recompute groups when any source store changes
  if (issue_stores && typeof issue_stores.subscribe === 'function') {
    issue_stores.subscribe(() => {
      const had_none = groups.length === 0;
      all_groups = buildGroups();
      recomputeGroups();
      doRender();
      // Auto-expand first epic when transitioning from empty to non-empty
      if (had_none && groups.length > 0) {
        const first_id = String(groups[0].epic?.id || '');
        if (first_id && !expanded.has(first_id)) {
          expanded.add(first_id);
          doRender();
        }
      }
    });
  }

  // Re-render when the shared header search text, prio filter, or
  // hide-closed toggle changes.
  if (store && typeof store.subscribe === 'function') {
    let last_search = searchText();
    let last_prio = JSON.stringify(prioFilter());
    let last_hide_closed = hideClosed();
    store.subscribe(() => {
      const next_search = searchText();
      const next_prio = JSON.stringify(prioFilter());
      const next_hide_closed = hideClosed();
      if (
        next_search !== last_search ||
        next_prio !== last_prio ||
        next_hide_closed !== last_hide_closed
      ) {
        last_search = next_search;
        last_prio = next_prio;
        last_hide_closed = next_hide_closed;
        recomputeGroups();
        doRender();
      }
    });
  }

  function doRender() {
    render(template(), mount_element);
  }

  function template() {
    if (!groups.length) {
      return html`<div class="panel__header muted">No epics found.</div>`;
    }
    return html`<div class="epics-root">
      ${groups.map((g) => groupTemplate(g))}
    </div>`;
  }

  /**
   * @param {EpicGroup} g
   */
  function groupTemplate(g) {
    const epic = g.epic || {};
    const id = String(epic.id || '');
    const is_open = expanded.has(id);
    const raw_children = g.children;
    const list = hideClosed()
      ? raw_children.filter((it) => String(it?.status || '') !== 'closed')
      : raw_children;
    const closed_pct = g.total > 0 ? (g.closed / g.total) * 100 : 0;
    const wip_pct = g.total > 0 ? (g.wip / g.total) * 100 : 0;
    const id_el = createIssueIdRenderer(id, { class_name: 'epic-header__id' });
    id_el.style.color = g.color;
    return html`
      <div class="epic-group" data-epic-id=${id}>
        <div
          class="epic-header"
          @click=${() => toggle(id)}
          role="button"
          tabindex="0"
          aria-expanded=${is_open}
        >
          <span class="epic-header__caret ${is_open ? 'is-open' : ''}"
            >&#9656;</span
          >
          <span
            class="epic-header__tile"
            style="background: color-mix(in srgb, ${g.color} 20%, transparent); color: ${g.color}"
            >${createTypeIcon('epic')}</span
          >
          ${id_el} ${createPriorityBadge(epic.priority)}
          <span class="epic-header__status-label muted"
            >${statusLabel(epic.status)}</span
          >
          <span class="epic-header__title text-truncate"
            >${epic.title || '(no title)'}</span
          >
          <span class="epic-header__spacer"></span>
          <div class="epic-header__stats">
            <div class="epic-header__counts mono">
              ${g.blocked > 0
                ? html`<span class="epic-count epic-count--blocked"
                    >${g.blocked} blkd</span
                  >`
                : ''}
              ${g.ready > 0
                ? html`<span class="epic-count epic-count--ready"
                    >${g.ready} ready</span
                  >`
                : ''}
              ${g.wip > 0
                ? html`<span class="epic-count epic-count--wip"
                    >${g.wip} wip</span
                  >`
                : ''}
              <span class="epic-count epic-count--done muted"
                >${g.closed}/${g.total} done</span
              >
            </div>
            <div class="epic-header__bar">
              <span
                class="epic-header__bar-closed"
                style="width: ${closed_pct}%"
              ></span>
              <span
                class="epic-header__bar-wip"
                style="width: ${wip_pct}%; left: ${closed_pct}%"
              ></span>
            </div>
          </div>
        </div>
        ${is_open
          ? html`<div class="epic-children">
              ${list.length === 0
                ? html`<div class="muted">No issues found</div>`
                : list.map((it) => childRowTemplate(g, it))}
            </div>`
          : null}
      </div>
    `;
  }

  /**
   * Compact child row: status dot, type icon, id, title, priority badge,
   * status label. Click navigates to the issue Detail view.
   *
   * @param {EpicGroup} g
   * @param {IssueLite} it
   */
  function childRowTemplate(g, it) {
    const status = String(it.status || 'open');
    return html`
      <div
        class="epic-row"
        data-issue-id=${it.id}
        role="button"
        tabindex="0"
        @click=${() => goto_issue(it.id)}
        @keydown=${
          /** @param {KeyboardEvent} e */ (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              goto_issue(it.id);
            }
          }
        }
      >
        <span class="epic-row__status-dot is-${status}"></span>
        ${createTypeIcon(it.issue_type)}
        ${createIssueIdRenderer(it.id, { class_name: 'epic-row__id' })}
        <span class="epic-row__title text-truncate"
          >${it.title || '(no title)'}</span
        >
        ${createPriorityBadge(it.priority)}
        <span class="epic-row__status muted">${statusLabel(status)}</span>
      </div>
    `;
  }

  /**
   * @param {string} epic_id
   */
  function toggle(epic_id) {
    if (expanded.has(epic_id)) {
      expanded.delete(epic_id);
    } else {
      expanded.add(epic_id);
    }
    doRender();
  }

  /**
   * Build epic groups from the epic-entity snapshot plus the four
   * status-list snapshots (same grouping approach as Board swimlanes).
   *
   * @returns {EpicGroup[]}
   */
  function buildGroups() {
    if (!issue_stores || typeof issue_stores.snapshotFor !== 'function') {
      return [];
    }
    /** @type {IssueLite[]} */
    const epic_entities = /** @type {IssueLite[]} */ (
      issue_stores.snapshotFor('tab:epics') || []
    );
    const list_blocked = issue_stores.snapshotFor('tab:epics:blocked') || [];
    const list_ready = issue_stores.snapshotFor('tab:epics:ready') || [];
    const list_wip =
      issue_stores.snapshotFor('tab:epics:in-progress') || [];
    const list_closed = issue_stores.snapshotFor('tab:epics:closed') || [];

    /** @type {Map<string, { blocked: IssueLite[], ready: IssueLite[], wip: IssueLite[], closed: IssueLite[] }>} */
    const by_epic = new Map();

    /**
     * @param {string} epic_id
     */
    function ensure(epic_id) {
      let bucket = by_epic.get(epic_id);
      if (!bucket) {
        bucket = { blocked: [], ready: [], wip: [], closed: [] };
        by_epic.set(epic_id, bucket);
      }
      return bucket;
    }

    /**
     * @param {IssueLite[]} items
     * @param {'blocked'|'ready'|'wip'|'closed'} key
     */
    function place(items, key) {
      for (const it of items) {
        if (it.issue_type === 'epic') {
          continue;
        }
        const epic_id = typeof it.epic_id === 'string' ? it.epic_id : '';
        if (!epic_id) {
          continue;
        }
        ensure(epic_id)[key].push(it);
      }
    }
    place(list_blocked, 'blocked');
    place(list_ready, 'ready');
    place(list_wip, 'wip');
    place(list_closed, 'closed');

    /** @type {EpicGroup[]} */
    const next_groups = [];
    for (const epic of epic_entities) {
      const id = String(epic.id || '');
      if (!id) {
        continue;
      }
      const bucket = by_epic.get(id) || {
        blocked: [],
        ready: [],
        wip: [],
        closed: []
      };
      const children = [
        ...bucket.blocked,
        ...bucket.ready,
        ...bucket.wip,
        ...bucket.closed
      ].sort(cmpPriorityThenCreated);
      next_groups.push({
        epic,
        color: colorForEpic(id),
        blocked: bucket.blocked.length,
        ready: bucket.ready.length,
        wip: bucket.wip.length,
        closed: bucket.closed.length,
        total:
          bucket.blocked.length +
          bucket.ready.length +
          bucket.wip.length +
          bucket.closed.length,
        children
      });
    }
    return next_groups;
  }

  return {
    async load() {
      all_groups = buildGroups();
      recomputeGroups();
      doRender();
      // Auto-expand first epic on screen
      if (groups.length > 0) {
        const first_id = String(groups[0].epic?.id || '');
        if (first_id && !expanded.has(first_id)) {
          expanded.add(first_id);
          doRender();
        }
      }
    }
  };
}
