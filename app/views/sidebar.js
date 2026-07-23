import { html, render } from 'lit-html';
import { debug } from '../utils/logging.js';

const ICONS = {
  board: html`<svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
  >
    <rect x="1.5" y="2.5" width="4" height="11" rx="1" />
    <rect x="6.5" y="2.5" width="4" height="7" rx="1" />
    <rect x="11.5" y="2.5" width="3" height="9" rx="1" />
  </svg>`,
  epics: html`<svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linejoin="round"
  >
    <path d="M8 1.5l6.5 3.5L8 8.5 1.5 5z" />
    <path d="M1.5 8.5L8 12l6.5-3.5" />
    <path d="M1.5 12L8 15.5 14.5 12" />
  </svg>`,
  issues: html`<svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
  >
    <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
  </svg>`
};

const SUN_ICON = html`<svg
  width="15"
  height="15"
  viewBox="0 0 16 16"
  fill="none"
  stroke="currentColor"
  stroke-width="1.6"
  stroke-linecap="round"
>
  <circle cx="8" cy="8" r="3.2" />
  <path
    d="M8 1v1.6M8 13.4V15M15 8h-1.6M2.6 8H1M12.8 3.2l-1.1 1.1M4.3 11.7l-1.1 1.1M12.8 12.8l-1.1-1.1M4.3 4.3L3.2 3.2"
  />
</svg>`;

const MOON_ICON = html`<svg
  width="15"
  height="15"
  viewBox="0 0 16 16"
  fill="currentColor"
>
  <path
    d="M13.8 10.2A6 6 0 1 1 5.8 2.2a6.6 6.6 0 1 0 8 8z"
  />
</svg>`;

/** @type {Array<{ view: 'board'|'epics'|'issues', label: string }>} */
const NAV_ITEMS = [
  { view: 'board', label: 'Board' },
  { view: 'epics', label: 'Epics' },
  { view: 'issues', label: 'Issues' }
];

/**
 * Create the left activity sidebar: logo tile, view-switcher icon buttons,
 * and a theme toggle pinned to the bottom.
 *
 * @param {HTMLElement} mount_element
 * @param {{ getState: () => any, subscribe: (fn: (s: any) => void) => () => void }} store
 * @param {{ gotoView: (v: 'issues'|'epics'|'board') => void }} router
 * @param {{ getTheme: () => 'light'|'dark', setTheme: (mode: 'light'|'dark') => void }} theme
 */
export function createSidebar(mount_element, store, router, theme) {
  const log = debug('views:sidebar');
  /** @type {(() => void) | null} */
  let unsubscribe = null;

  /**
   * @param {'board'|'epics'|'issues'} view
   */
  function onClick(view) {
    return (/** @type {MouseEvent} */ ev) => {
      ev.preventDefault();
      log('click nav %s', view);
      router.gotoView(view);
    };
  }

  function onToggleTheme() {
    const next = theme.getTheme() === 'dark' ? 'light' : 'dark';
    theme.setTheme(next);
    doRender();
  }

  function template() {
    const s = store.getState();
    const active = s.view || 'issues';
    const mode = theme.getTheme();
    return html`
      <div class="sidebar__logo" aria-hidden="true">
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#fff"
          stroke-width="2.4"
          stroke-linecap="round"
        >
          <circle cx="6" cy="6" r="2.4" />
          <circle cx="18" cy="6" r="2.4" />
          <circle cx="12" cy="18" r="2.4" />
          <path d="M6 8.4v3.6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8.4M12 14v1.6" />
        </svg>
      </div>
      ${NAV_ITEMS.map(
        (item) => html`
          <button
            type="button"
            class="sidebar__nav-btn ${active === item.view ? 'active' : ''}"
            title="${item.label}"
            @click=${onClick(item.view)}
          >
            ${ICONS[item.view]}
          </button>
        `
      )}
      <div class="sidebar__spacer"></div>
      <button
        type="button"
        class="sidebar__theme-btn"
        title="Toggle theme"
        aria-label="Toggle theme"
        @click=${onToggleTheme}
      >
        ${mode === 'dark' ? SUN_ICON : MOON_ICON}
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
