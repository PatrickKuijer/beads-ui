import { html, render } from 'lit-html';
import { createListSelectors } from '../data/list-selectors.js';
import { cmpClosedDesc, cmpPriorityThenCreated } from '../data/sort.js';
import { colorForEpic } from '../utils/epic-color.js';
import { createIssueIdRenderer } from '../utils/issue-id-renderer.js';
import { debug } from '../utils/logging.js';
import { createPriorityBadge } from '../utils/priority-badge.js';
import { showToast } from '../utils/toast.js';
import { createTypeIcon } from '../utils/type-icon.js';

/**
 * @typedef {{
 *   id: string,
 *   title?: string,
 *   status?: 'open'|'in_progress'|'closed',
 *   priority?: number,
 *   issue_type?: string,
 *   epic_id?: string | null,
 *   dependency_count?: number,
 *   dependent_count?: number,
 *   created_at?: number,
 *   updated_at?: number,
 *   closed_at?: number
 * }} IssueLite
 */

/**
 * @typedef {{ id: string, title?: string, status?: string, priority?: number, total_children?: number, closed_children?: number }} EpicLite
 */

/**
 * @typedef {{ key: string, epic: EpicLite | null, blocked: IssueLite[], ready: IssueLite[], inprogress: IssueLite[], closed: IssueLite[] }} Lane
 */

/**
 * Board columns, in display order. `status` is the value sent via
 * `update-status` when a card is dropped on this column.
 *
 * @type {Array<{ key: 'blocked'|'ready'|'inprogress'|'closed', title: string, colorVar: string, status: 'open'|'in_progress'|'closed' }>}
 */
const COLUMNS = [
  { key: 'blocked', title: 'Blocked', colorVar: '--c-blocked', status: 'open' },
  { key: 'ready', title: 'Ready', colorVar: '--c-ready', status: 'open' },
  {
    key: 'inprogress',
    title: 'In Progress',
    colorVar: '--c-inprog',
    status: 'in_progress'
  },
  { key: 'closed', title: 'Closed', colorVar: '--c-closed', status: 'closed' }
];

/** Status-pill label per board column (mirrors column placement, not raw issue status). */
const COLUMN_STATUS_LABEL = {
  blocked: 'Blocked',
  ready: 'Ready',
  inprogress: 'In progress',
  closed: 'Closed'
};

/**
 * Create the Board view: epic swimlanes over Blocked / Ready / In progress / Closed.
 * Push-only: derives items from per-subscription stores.
 *
 * Sorting rules:
 * - Ready/Blocked/In progress: priority asc, then created_at asc.
 * - Closed: closed_at desc.
 *
 * @param {HTMLElement} mount_element
 * @param {unknown} _data - Unused (legacy param retained for call-compat)
 * @param {(id: string) => void} gotoIssue - Navigate to issue detail.
 * @param {{ getState: () => any, setState: (patch: any) => void, subscribe?: (fn: (s:any)=>void)=>()=>void }} [store]
 * @param {{ selectors: { getIds: (client_id: string) => string[], count?: (client_id: string) => number } }} [subscriptions]
 * @param {{ snapshotFor?: (client_id: string) => any[], subscribe?: (fn: () => void) => () => void }} [issueStores]
 * @param {(type: string, payload: unknown) => Promise<unknown>} [transport] - Transport function for sending updates
 * @returns {{ load: () => Promise<void>, clear: () => void }}
 */
export function createBoardView(
  mount_element,
  _data,
  gotoIssue,
  store,
  subscriptions = undefined,
  issueStores = undefined,
  transport = undefined
) {
  const log = debug('views:board');
  /** @type {IssueLite[]} */
  let list_ready = [];
  /** @type {IssueLite[]} */
  let list_blocked = [];
  /** @type {IssueLite[]} */
  let list_in_progress = [];
  /** @type {IssueLite[]} */
  let list_closed = [];
  /** @type {IssueLite[]} */
  let list_closed_raw = [];
  // Centralized selection helpers
  const selectors = issueStores ? createListSelectors(issueStores) : null;

  /** Collapsed lane keys (default: all lanes open). @type {Set<string>} */
  const collapsed_lanes = new Set();

  /**
   * Closed column filter mode.
   * 'today' → items with closed_at since local day start
   * '3' → last 3 days; '7' → last 7 days
   *
   * @type {'today'|'3'|'7'}
   */
  let closed_filter_mode = 'today';
  if (store) {
    try {
      const s = store.getState();
      const cf =
        s && s.board ? String(s.board.closed_filter || 'today') : 'today';
      if (cf === 'today' || cf === '3' || cf === '7') {
        closed_filter_mode = /** @type {any} */ (cf);
      }
    } catch {
      // ignore store init errors
    }
  }

  /**
   * Current hide-closed toggle from the shared header control. When true,
   * the Closed column is hidden from the board layout entirely.
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
   * Columns to render, excluding Closed when the header's hide-closed
   * toggle is active.
   *
   * @returns {typeof COLUMNS}
   */
  function visibleColumns() {
    return hideClosed() ? COLUMNS.filter((c) => c.key !== 'closed') : COLUMNS;
  }

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
   * @param {IssueLite[]} items
   * @returns {IssueLite[]}
   */
  function applySearchFilter(items) {
    const needle = searchText();
    if (!needle) {
      return items;
    }
    return items.filter((it) => {
      const a = String(it.id).toLowerCase();
      const b = String(it.title || '').toLowerCase();
      return a.includes(needle) || b.includes(needle);
    });
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
   * @param {IssueLite[]} items
   * @returns {IssueLite[]}
   */
  function applyPrioFilter(items) {
    const prio = prioFilter();
    if (prio.length >= 4) {
      return items;
    }
    return items.filter((it) => prio.includes(Number(it.priority)));
  }

  /**
   * Build swimlanes by grouping the four column lists by `epic_id`.
   * Lanes are sorted by epic title (case-insensitive); the "No epic" lane
   * always sorts last. Only lanes with at least one visible card are shown.
   *
   * @returns {Lane[]}
   */
  function computeLanes() {
    /** @type {Map<string, EpicLite>} */
    const epic_by_id = new Map();
    if (issueStores && typeof issueStores.snapshotFor === 'function') {
      const epics = /** @type {EpicLite[]} */ (
        issueStores.snapshotFor('tab:board:epics') || []
      );
      for (const e of epics) {
        if (e && typeof e.id === 'string' && e.id.length > 0) {
          epic_by_id.set(e.id, e);
        }
      }
    }

    /** @type {Map<string, Lane>} */
    const lanes_by_key = new Map();

    /**
     * @param {string} lane_key
     * @returns {Lane}
     */
    function ensureLane(lane_key) {
      let lane = lanes_by_key.get(lane_key);
      if (!lane) {
        lane = {
          key: lane_key,
          epic: lane_key ? epic_by_id.get(lane_key) || null : null,
          blocked: [],
          ready: [],
          inprogress: [],
          closed: []
        };
        lanes_by_key.set(lane_key, lane);
      }
      return lane;
    }

    /**
     * @param {IssueLite[]} items
     * @param {'blocked'|'ready'|'inprogress'|'closed'} col
     */
    function place(items, col) {
      for (const it of applyPrioFilter(applySearchFilter(items))) {
        // Epics are represented by their swimlane header, not as cards.
        if (it.issue_type === 'epic' || epic_by_id.has(it.id)) {
          continue;
        }
        const lane_key = typeof it.epic_id === 'string' ? it.epic_id : '';
        ensureLane(lane_key)[col].push(it);
      }
    }
    place(list_blocked, 'blocked');
    place(list_ready, 'ready');
    place(list_in_progress, 'inprogress');
    place(list_closed, 'closed');

    const lanes = Array.from(lanes_by_key.values());
    lanes.sort((a, b) => {
      if (!a.key) {
        return 1;
      }
      if (!b.key) {
        return -1;
      }
      const ta = (a.epic?.title || a.key).toLowerCase();
      const tb = (b.epic?.title || b.key).toLowerCase();
      return ta < tb ? -1 : ta > tb ? 1 : 0;
    });
    return lanes;
  }

  function template() {
    const lanes = computeLanes();
    const cols = visibleColumns();
    const hide_closed = hideClosed();
    return html`
      <div
        class="panel__body board-root ${hide_closed
          ? 'board-root--hide-closed'
          : ''}"
      >
        <div class="board-columns-header" role="row">
          ${cols.map((col) => columnHeaderTemplate(col))}
        </div>
        <div class="board-lanes">
          ${lanes.length === 0
            ? html`<div class="board-empty muted">No issues to show.</div>`
            : lanes.map((lane) => laneTemplate(lane, cols))}
        </div>
      </div>
    `;
  }

  /**
   * @param {{ key: string, title: string, colorVar: string }} col
   */
  function columnHeaderTemplate(col) {
    const items = columnItems(col.key);
    const item_count = items.length;
    const count_label = item_count === 1 ? '1 issue' : `${item_count} issues`;
    const dom_id = `${col.key === 'inprogress' ? 'in-progress' : col.key}-col`;
    return html`
      <div class="board-column__header" id=${dom_id}>
        <div class="board-column__title">
          <span
            class="board-column__swatch"
            style="background: var(${col.colorVar})"
          ></span>
          <span class="board-column__title-text">${col.title}</span>
          <span class="badge board-column__count" aria-label=${count_label}>
            ${item_count}
          </span>
        </div>
        ${col.key === 'closed'
          ? html`<label class="board-closed-filter">
              <span class="visually-hidden">Filter closed issues</span>
              <select
                id="closed-filter"
                aria-label="Filter closed issues"
                @change=${onClosedFilterChange}
              >
                <option
                  value="today"
                  ?selected=${closed_filter_mode === 'today'}
                >
                  Today
                </option>
                <option value="3" ?selected=${closed_filter_mode === '3'}>
                  Last 3 days
                </option>
                <option value="7" ?selected=${closed_filter_mode === '7'}>
                  Last 7 days
                </option>
              </select>
            </label>`
          : ''}
      </div>
    `;
  }

  /**
   * @param {string} col_key
   * @returns {IssueLite[]}
   */
  function columnItems(col_key) {
    if (col_key === 'blocked') {
      return applyPrioFilter(applySearchFilter(list_blocked));
    }
    if (col_key === 'ready') {
      return applyPrioFilter(applySearchFilter(list_ready));
    }
    if (col_key === 'inprogress') {
      return applyPrioFilter(applySearchFilter(list_in_progress));
    }
    return applyPrioFilter(applySearchFilter(list_closed));
  }

  /**
   * @param {Lane} lane
   * @param {typeof COLUMNS} cols
   */
  function laneTemplate(lane, cols) {
    const is_open = !collapsed_lanes.has(lane.key);
    const total =
      lane.blocked.length +
      lane.ready.length +
      lane.inprogress.length +
      lane.closed.length;
    const done = lane.epic
      ? Number(lane.epic.closed_children ?? lane.closed.length) || 0
      : lane.closed.length;
    const lane_total = lane.epic
      ? Number(lane.epic.total_children ?? total) || total
      : total;
    const pct = lane_total > 0 ? Math.round((done / lane_total) * 100) : 0;
    const color = lane.key ? colorForEpic(lane.key) : 'var(--muted)';
    const title = lane.key
      ? lane.epic?.title || lane.key
      : 'No epic · orphan issues';

    return html`
      <section class="board-lane" data-epic-id=${lane.key}>
        <header
          class="board-lane__header"
          role="button"
          tabindex="0"
          aria-expanded=${is_open}
          @click=${() => toggleLane(lane.key)}
          @keydown=${
            /** @param {KeyboardEvent} ev */ (ev) => {
              if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                toggleLane(lane.key);
              }
            }
          }
        >
          <span class="board-lane__caret ${is_open ? 'is-open' : ''}"
            >&#9656;</span
          >
          <span
            class="board-lane__tile"
            style="background: color-mix(in srgb, ${color} 20%, transparent); color: ${color}"
            >${lane.key ? createTypeIcon('epic') : '—'}</span
          >
          ${lane.key
            ? html`<span
                class="board-lane__id mono board-lane__id--link"
                style="color: ${color}"
                role="button"
                tabindex="0"
                title="Open epic ${lane.key}"
                @click=${(/** @type {MouseEvent} */ ev) =>
                  onLaneIdClick(ev, lane.key)}
                @keydown=${(/** @type {KeyboardEvent} */ ev) =>
                  onLaneIdKeydown(ev, lane.key)}
                >${lane.key}</span
              >`
            : ''}
          ${lane.key
            ? html`<span
                class="board-lane__title board-lane__title--link text-truncate"
                role="button"
                tabindex="0"
                title="Open epic ${lane.key}"
                @click=${(/** @type {MouseEvent} */ ev) =>
                  onLaneIdClick(ev, lane.key)}
                @keydown=${(/** @type {KeyboardEvent} */ ev) =>
                  onLaneIdKeydown(ev, lane.key)}
                >${title}</span
              >`
            : html`<span class="board-lane__title text-truncate"
                >${title}</span
              >`}
          ${lane.key ? createPriorityBadge(lane.epic?.priority) : ''}
          <span class="board-lane__spacer"></span>
          <span class="board-lane__progress-track">
            <span
              class="board-lane__progress-fill"
              style="width: ${pct}%"
            ></span>
          </span>
          <span class="muted mono board-lane__progress-label"
            >${done}/${lane_total} done</span
          >
        </header>
        ${is_open
          ? html`<div class="board-lane__body">
              ${cols.map((col) => laneCellTemplate(lane, col))}
            </div>`
          : ''}
      </section>
    `;
  }

  /**
   * @param {Lane} lane
   * @param {{ key: 'blocked'|'ready'|'inprogress'|'closed', title: string }} col
   */
  function laneCellTemplate(lane, col) {
    const items = lane[col.key];
    const lane_label = lane.key ? lane.epic?.title || lane.key : 'No epic';
    return html`
      <div
        class="board-lane__cell"
        data-board-column=${col.key}
        data-epic-id=${lane.key}
        role="list"
        aria-label="${col.title} — ${lane_label}"
      >
        ${items.map((it) => cardTemplate(it, col))}
      </div>
    `;
  }

  /**
   * @param {IssueLite} it
   * @param {{ key: 'blocked'|'ready'|'inprogress'|'closed' }} col
   */
  function cardTemplate(it, col) {
    const p = typeof it.priority === 'number' ? it.priority : 2;
    const dep_count =
      Number(it.dependent_count || 0) + Number(it.dependency_count || 0);
    return html`
      <article
        class="board-card"
        data-issue-id=${it.id}
        data-priority=${Math.max(0, Math.min(3, p))}
        role="listitem"
        tabindex="-1"
        draggable="true"
        @click=${(/** @type {MouseEvent} */ ev) => onCardClick(ev, it.id)}
        @dragstart=${(/** @type {DragEvent} */ ev) => onDragStart(ev, it.id)}
        @dragend=${onDragEnd}
      >
        <div class="board-card__row1">
          ${createTypeIcon(it.issue_type)}
          ${createIssueIdRenderer(it.id, { class_name: 'mono board-card__id' })}
          <span class="board-card__spacer"></span>
          ${createPriorityBadge(it.priority)}
        </div>
        <div class="board-card__title text-truncate">
          ${it.title || '(no title)'}
        </div>
        <div class="board-card__row2">
          <span class="board-card__status board-card__status--${col.key}">
            <span class="board-card__status-dot"></span>
            ${COLUMN_STATUS_LABEL[col.key]}
          </span>
          <span class="board-card__spacer"></span>
          ${dep_count > 0
            ? html`<span
                class="board-card__deps mono"
                title="${dep_count} linked"
                >&#128279;${dep_count}</span
              >`
            : ''}
        </div>
      </article>
    `;
  }

  /**
   * Open the epic's detail view without also toggling lane collapse.
   *
   * @param {MouseEvent} ev
   * @param {string} epic_id
   */
  function onLaneIdClick(ev, epic_id) {
    ev.stopPropagation();
    gotoIssue(epic_id);
  }

  /**
   * @param {KeyboardEvent} ev
   * @param {string} epic_id
   */
  function onLaneIdKeydown(ev, epic_id) {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      ev.stopPropagation();
      gotoIssue(epic_id);
    }
  }

  /**
   * @param {string} lane_key
   */
  function toggleLane(lane_key) {
    if (collapsed_lanes.has(lane_key)) {
      collapsed_lanes.delete(lane_key);
    } else {
      collapsed_lanes.add(lane_key);
    }
    doRender();
  }

  /** @type {string|null} */
  let dragging_id = null;

  /**
   * Handle card click, ignoring clicks during drag operations.
   *
   * @param {MouseEvent} ev
   * @param {string} id
   */
  function onCardClick(ev, id) {
    // Only navigate if this wasn't a drag operation
    if (!dragging_id) {
      gotoIssue(id);
    }
  }

  /**
   * Handle drag start: store issue id in dataTransfer and add dragging class.
   *
   * @param {DragEvent} ev
   * @param {string} id
   */
  function onDragStart(ev, id) {
    dragging_id = id;
    if (ev.dataTransfer) {
      ev.dataTransfer.setData('text/plain', id);
      ev.dataTransfer.effectAllowed = 'move';
    }
    const target = /** @type {HTMLElement} */ (ev.target);
    target.classList.add('board-card--dragging');
    log('dragstart %s', id);
  }

  /**
   * Handle drag end: remove dragging class.
   *
   * @param {DragEvent} ev
   */
  function onDragEnd(ev) {
    const target = /** @type {HTMLElement} */ (ev.target);
    target.classList.remove('board-card--dragging');
    // Clear any highlighted drop target
    clearDropTarget();
    // Clear dragging_id after a short delay to allow click event to check it
    setTimeout(() => {
      dragging_id = null;
    }, 0);
    log('dragend');
  }

  /**
   * Clear the currently highlighted drop target cell.
   */
  function clearDropTarget() {
    /** @type {HTMLElement[]} */
    const all_cells = Array.from(
      mount_element.querySelectorAll('.board-lane__cell--drag-over')
    );
    for (const c of all_cells) {
      c.classList.remove('board-lane__cell--drag-over');
    }
  }

  /**
   * Update issue status via WebSocket transport.
   *
   * @param {string} issue_id
   * @param {'open'|'in_progress'|'closed'} new_status
   */
  async function updateIssueStatus(issue_id, new_status) {
    if (!transport) {
      log('no transport available, status update skipped');
      showToast('Cannot update status: not connected', 'error');
      return;
    }
    try {
      log('update-status %s → %s', issue_id, new_status);
      await transport('update-status', { id: issue_id, status: new_status });
      showToast('Status updated', 'success', 1500);
    } catch (err) {
      log('update-status failed: %o', err);
      showToast('Failed to update status', 'error');
    }
  }

  function doRender() {
    render(template(), mount_element);
    postRenderEnhance();
  }

  /**
   * Enhance rendered board with a11y and keyboard navigation.
   * - Roving tabindex per lane cell (first card tabbable).
   */
  function postRenderEnhance() {
    try {
      /** @type {HTMLElement[]} */
      const cells = Array.from(
        mount_element.querySelectorAll('.board-lane__cell')
      );
      for (const cell of cells) {
        /** @type {HTMLElement[]} */
        const cards = Array.from(cell.querySelectorAll('.board-card'));
        const col_name = cell.getAttribute('aria-label') || '';
        for (const card of cards) {
          const title_el = /** @type {HTMLElement|null} */ (
            card.querySelector('.board-card__title')
          );
          const t = title_el ? title_el.textContent?.trim() || '' : '';
          card.setAttribute(
            'aria-label',
            `Issue ${t || '(no title)'} — ${col_name}`
          );
          card.tabIndex = -1;
        }
        if (cards.length > 0) {
          cards[0].tabIndex = 0;
        }
      }
    } catch {
      // non-fatal
    }
  }

  // Delegate keyboard handling from mount_element
  mount_element.addEventListener('keydown', (ev) => {
    const target = ev.target;
    if (!target || !(target instanceof HTMLElement)) {
      return;
    }
    // Do not intercept keys inside editable controls
    const tag = String(target.tagName || '').toLowerCase();
    if (
      tag === 'input' ||
      tag === 'textarea' ||
      tag === 'select' ||
      target.isContentEditable === true
    ) {
      return;
    }
    const card = target.closest('.board-card');
    if (!card) {
      return;
    }
    const key = String(ev.key || '');
    if (key === 'Enter' || key === ' ') {
      ev.preventDefault();
      const id = card.getAttribute('data-issue-id');
      if (id) {
        gotoIssue(id);
      }
      return;
    }
    if (
      key !== 'ArrowUp' &&
      key !== 'ArrowDown' &&
      key !== 'ArrowLeft' &&
      key !== 'ArrowRight'
    ) {
      return;
    }
    ev.preventDefault();
    // Cell context (one column within one lane)
    const cell = /** @type {HTMLElement|null} */ (
      card.closest('.board-lane__cell')
    );
    if (!cell) {
      return;
    }
    /** @type {HTMLElement[]} */
    const cards = Array.from(cell.querySelectorAll('.board-card'));
    const idx = cards.indexOf(/** @type {HTMLElement} */ (card));
    if (idx === -1) {
      return;
    }
    if (key === 'ArrowDown' && idx < cards.length - 1) {
      moveFocus(cards[idx], cards[idx + 1]);
      return;
    }
    if (key === 'ArrowUp' && idx > 0) {
      moveFocus(cards[idx], cards[idx - 1]);
      return;
    }
    if (key === 'ArrowRight' || key === 'ArrowLeft') {
      // Find adjacent non-empty cell within the same lane
      const lane = /** @type {HTMLElement|null} */ (
        cell.closest('.board-lane')
      );
      if (!lane) {
        return;
      }
      /** @type {HTMLElement[]} */
      const lane_cells = Array.from(lane.querySelectorAll('.board-lane__cell'));
      const cell_idx = lane_cells.indexOf(cell);
      if (cell_idx === -1) {
        return;
      }
      const dir = key === 'ArrowRight' ? 1 : -1;
      let next_idx = cell_idx + dir;
      /** @type {HTMLElement|null} */
      let target_cell = null;
      while (next_idx >= 0 && next_idx < lane_cells.length) {
        const candidate = lane_cells[next_idx];
        if (candidate.querySelector('.board-card')) {
          target_cell = candidate;
          break;
        }
        next_idx += dir;
      }
      if (target_cell) {
        const first = /** @type {HTMLElement|null} */ (
          target_cell.querySelector('.board-card')
        );
        if (first) {
          moveFocus(/** @type {HTMLElement} */ (card), first);
        }
      }
      return;
    }
  });

  // Track the currently highlighted cell to avoid flicker
  /** @type {HTMLElement|null} */
  let current_drop_target = null;

  // Delegate drag and drop handling for lane cells
  mount_element.addEventListener('dragover', (ev) => {
    ev.preventDefault();
    if (ev.dataTransfer) {
      ev.dataTransfer.dropEffect = 'move';
    }
    const target = /** @type {HTMLElement} */ (ev.target);
    const cell = /** @type {HTMLElement|null} */ (
      target.closest('.board-lane__cell')
    );

    if (cell && cell !== current_drop_target) {
      if (current_drop_target) {
        current_drop_target.classList.remove('board-lane__cell--drag-over');
      }
      cell.classList.add('board-lane__cell--drag-over');
      current_drop_target = cell;
    }
  });

  mount_element.addEventListener('dragleave', (ev) => {
    const related = /** @type {HTMLElement|null} */ (ev.relatedTarget);
    if (!related || !mount_element.contains(related)) {
      if (current_drop_target) {
        current_drop_target.classList.remove('board-lane__cell--drag-over');
        current_drop_target = null;
      }
    }
  });

  mount_element.addEventListener('drop', (ev) => {
    ev.preventDefault();
    if (current_drop_target) {
      current_drop_target.classList.remove('board-lane__cell--drag-over');
      current_drop_target = null;
    }

    const target = /** @type {HTMLElement} */ (ev.target);
    const cell = target.closest('.board-lane__cell');
    if (!cell) {
      return;
    }

    const col_key = cell.getAttribute('data-board-column') || '';
    const col = COLUMNS.find((c) => c.key === col_key);
    if (!col) {
      log('drop on unknown column: %s', col_key);
      return;
    }

    const issue_id = ev.dataTransfer?.getData('text/plain');
    if (!issue_id) {
      log('drop without issue id');
      return;
    }

    log('drop %s on %s → %s', issue_id, col_key, col.status);
    void updateIssueStatus(issue_id, col.status);
  });

  /**
   * @param {HTMLElement} from
   * @param {HTMLElement} to
   */
  function moveFocus(from, to) {
    try {
      from.tabIndex = -1;
      to.tabIndex = 0;
      to.focus();
    } catch {
      // ignore focus errors
    }
  }

  // Sort helpers centralized in app/data/sort.js

  /**
   * Recompute closed list from raw using the current filter and sort.
   */
  function applyClosedFilter() {
    log('applyClosedFilter %s', closed_filter_mode);
    /** @type {IssueLite[]} */
    let items = Array.isArray(list_closed_raw) ? [...list_closed_raw] : [];
    const now = new Date();
    let since_ts = 0;
    if (closed_filter_mode === 'today') {
      const start = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        0,
        0,
        0,
        0
      );
      since_ts = start.getTime();
    } else if (closed_filter_mode === '3') {
      since_ts = now.getTime() - 3 * 24 * 60 * 60 * 1000;
    } else if (closed_filter_mode === '7') {
      since_ts = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    }
    items = items.filter((it) => {
      const s = Number.isFinite(it.closed_at)
        ? /** @type {number} */ (it.closed_at)
        : NaN;
      if (!Number.isFinite(s)) {
        return false;
      }
      return s >= since_ts;
    });
    items.sort(cmpClosedDesc);
    list_closed = items;
  }

  /**
   * @param {Event} ev
   */
  function onClosedFilterChange(ev) {
    try {
      const el = /** @type {HTMLSelectElement} */ (ev.target);
      const v = String(el.value || 'today');
      closed_filter_mode = v === '3' || v === '7' ? v : 'today';
      log('closed filter %s', closed_filter_mode);
      if (store) {
        try {
          store.setState({ board: { closed_filter: closed_filter_mode } });
        } catch {
          // ignore store errors
        }
      }
      applyClosedFilter();
      doRender();
    } catch {
      // ignore
    }
  }

  /**
   * Compose lists from subscriptions + issues store and render.
   */
  function refreshFromStores() {
    try {
      if (selectors) {
        const in_progress = selectors.selectBoardColumn(
          'tab:board:in-progress',
          'in_progress'
        );
        const blocked = selectors.selectBoardColumn(
          'tab:board:blocked',
          'blocked'
        );
        const ready_raw = selectors.selectBoardColumn(
          'tab:board:ready',
          'ready'
        );
        const closed = selectors.selectBoardColumn(
          'tab:board:closed',
          'closed'
        );

        // Ready excludes items that are in progress
        /** @type {Set<string>} */
        const in_prog_ids = new Set(in_progress.map((i) => i.id));
        const ready = ready_raw.filter((i) => !in_prog_ids.has(i.id));

        list_ready = ready;
        list_blocked = blocked;
        list_in_progress = in_progress;
        list_closed_raw = closed;
      }
      applyClosedFilter();
      doRender();
    } catch {
      list_ready = [];
      list_blocked = [];
      list_in_progress = [];
      list_closed = [];
      doRender();
    }
  }

  // Live updates: recompose on issue store envelopes
  if (selectors) {
    selectors.subscribe(() => {
      try {
        refreshFromStores();
      } catch {
        // ignore
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
        doRender();
      }
    });
  }

  return {
    async load() {
      // Compose lists from subscriptions + issues store
      log('load');
      refreshFromStores();
      // If nothing is present yet (e.g., immediately after switching back
      // to the Board and before list-delta arrives), fetch via data layer as
      // a fallback so the board is not empty on initial display.
      try {
        const has_subs = Boolean(subscriptions && subscriptions.selectors);
        /**
         * @param {string} id
         */
        const cnt = (id) => {
          if (!has_subs || !subscriptions) {
            return 0;
          }
          const sel = subscriptions.selectors;
          if (typeof sel.count === 'function') {
            return Number(sel.count(id) || 0);
          }
          try {
            const arr = sel.getIds(id);
            return Array.isArray(arr) ? arr.length : 0;
          } catch {
            return 0;
          }
        };
        const total_items =
          cnt('tab:board:ready') +
          cnt('tab:board:blocked') +
          cnt('tab:board:in-progress') +
          cnt('tab:board:closed');
        const data = /** @type {any} */ (_data);
        const can_fetch =
          data &&
          typeof data.getReady === 'function' &&
          typeof data.getBlocked === 'function' &&
          typeof data.getInProgress === 'function' &&
          typeof data.getClosed === 'function';
        if (total_items === 0 && can_fetch) {
          log('fallback fetch');
          /** @type {[IssueLite[], IssueLite[], IssueLite[], IssueLite[]]} */
          const [ready_raw, blocked_raw, in_prog_raw, closed_raw] =
            await Promise.all([
              data.getReady().catch(() => []),
              data.getBlocked().catch(() => []),
              data.getInProgress().catch(() => []),
              data.getClosed().catch(() => [])
            ]);
          // Normalize and map unknowns to IssueLite shape
          /** @type {IssueLite[]} */
          let ready = Array.isArray(ready_raw) ? ready_raw.map((it) => it) : [];
          /** @type {IssueLite[]} */
          const blocked = Array.isArray(blocked_raw)
            ? blocked_raw.map((it) => it)
            : [];
          /** @type {IssueLite[]} */
          const in_prog = Array.isArray(in_prog_raw)
            ? in_prog_raw.map((it) => it)
            : [];
          /** @type {IssueLite[]} */
          const closed = Array.isArray(closed_raw)
            ? closed_raw.map((it) => it)
            : [];

          // Remove items from Ready that are already In Progress
          /** @type {Set<string>} */
          const in_progress_ids = new Set(in_prog.map((i) => i.id));
          ready = ready.filter((i) => !in_progress_ids.has(i.id));

          // Sort as per column rules
          ready.sort(cmpPriorityThenCreated);
          blocked.sort(cmpPriorityThenCreated);
          in_prog.sort(cmpPriorityThenCreated);
          list_ready = ready;
          list_blocked = blocked;
          list_in_progress = in_prog;
          list_closed_raw = closed;
          applyClosedFilter();
          doRender();
        }
      } catch {
        // ignore fallback errors
      }
    },
    clear() {
      mount_element.replaceChildren();
      list_ready = [];
      list_blocked = [];
      list_in_progress = [];
      list_closed = [];
    }
  };
}
