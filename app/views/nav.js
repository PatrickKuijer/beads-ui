import { html, render } from 'lit-html';
import { debug } from '../utils/logging.js';

/**
 * Render the top navigation and handle route changes.
 *
 * @param {HTMLElement} mount_element
 * @param {{ getState: () => any, subscribe: (fn: (s: any) => void) => () => void }} store
 * @param {{ gotoView: (v: 'issues'|'epics'|'board'|'sessions') => void }} router
 */
export function createTopNav(mount_element, store, router) {
  const log = debug('views:nav');
  /** @type {(() => void) | null} */
  let unsubscribe = null;

  /**
   * @param {'issues'|'epics'|'board'|'sessions'} view
   * @returns {(ev: MouseEvent) => void}
   */
  function onClick(view) {
    return (ev) => {
      ev.preventDefault();
      log('click tab %s', view);
      router.gotoView(view);
    };
  }

  function template() {
    const s = store.getState();
    const active = s.view || 'issues';
    return html`
      <a
        href="#/issues"
        class="tab ${active === 'issues' ? 'active' : ''}"
        @click=${onClick('issues')}
        >Issues</a
      >
      <a
        href="#/epics"
        class="tab ${active === 'epics' ? 'active' : ''}"
        @click=${onClick('epics')}
        >Epics</a
      >
      <a
        href="#/board"
        class="tab ${active === 'board' ? 'active' : ''}"
        @click=${onClick('board')}
        >Board</a
      >
      <a
        href="#/sessions"
        class="tab ${active === 'sessions' ? 'active' : ''}"
        @click=${onClick('sessions')}
        >Sessions</a
      >
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
