import { html, render } from 'lit-html';
import { debug } from '../utils/logging.js';

/** @type {Array<{ value: number, label: string }>} */
const PRIORITIES = [
  { value: 0, label: 'P0' },
  { value: 1, label: 'P1' },
  { value: 2, label: 'P2' },
  { value: 3, label: 'P3' }
];

/**
 * Create the header's global controls: id/title search, priority chips,
 * and a hide/show-closed toggle. Applies to the Issues list; Board and
 * Epics views are unaffected for now.
 *
 * @param {HTMLElement} mount_element
 * @param {{ getState: () => any, setState: (patch: any) => void, subscribe: (fn: (s: any) => void) => () => void }} store
 */
export function createHeaderControls(mount_element, store) {
  const log = debug('views:header-controls');
  /** @type {(() => void) | null} */
  let unsubscribe = null;

  /**
   * @param {InputEvent} ev
   */
  function onSearchInput(ev) {
    const value = /** @type {HTMLInputElement} */ (ev.target).value;
    store.setState({ filters: { search: value } });
  }

  /**
   * @param {number} prio
   */
  function togglePrio(prio) {
    return () => {
      const current = store.getState().filters?.prio || [0, 1, 2, 3];
      const next = current.includes(prio)
        ? current.filter((/** @type {number} */ p) => p !== prio)
        : [...current, prio].sort();
      log('toggle prio %d -> %o', prio, next);
      store.setState({ filters: { prio: next } });
    };
  }

  function toggleHideClosed() {
    const current = store.getState().filters?.hideClosed === true;
    store.setState({ filters: { hideClosed: !current } });
  }

  function template() {
    const s = store.getState();
    const search = s.filters?.search || '';
    const prio = s.filters?.prio || [0, 1, 2, 3];
    const hide_closed = s.filters?.hideClosed === true;
    return html`
      <div class="header-search">
        <svg
          width="13"
          height="13"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          aria-hidden="true"
        >
          <circle cx="7" cy="7" r="4.5" />
          <path d="M11 11l3 3" stroke-linecap="round" />
        </svg>
        <input
          type="search"
          class="header-search__input"
          placeholder="Search id or title…"
          .value=${search}
          @input=${onSearchInput}
          aria-label="Search issues by id or title"
        />
      </div>
      <div class="header-prio-chips">
        ${PRIORITIES.map(
          (p) => html`
            <button
              type="button"
              class="prio-chip ${prio.includes(p.value) ? 'active' : ''}"
              data-prio="${p.value}"
              title="Toggle ${p.label}"
              @click=${togglePrio(p.value)}
            >
              ${p.label}
            </button>
          `
        )}
      </div>
      <button
        type="button"
        class="hide-closed-toggle ${hide_closed ? 'active' : ''}"
        @click=${toggleHideClosed}
      >
        ${hide_closed ? 'Show closed' : 'Hide closed'}
      </button>
    `;
  }

  function doRender() {
    render(template(), mount_element);
  }

  doRender();
  unsubscribe = store.subscribe(() => doRender());

  return {
    destroy() {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
      render(html``, mount_element);
    }
  };
}
