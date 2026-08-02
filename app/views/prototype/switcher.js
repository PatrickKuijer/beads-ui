/**
 * PROTOTYPE — floating variant switcher. Throwaway.
 *
 * Reads/writes `variant` in the hash query (`#/roadmap?variant=B`) so a
 * variant is shareable and survives reload. Hidden unless the page is served
 * from localhost, so a stray merge cannot ship this bar to anyone.
 */
import { html } from 'lit-html';

/**
 * @param {string} [hash]
 * @returns {string}
 */
export function readVariant(hash = undefined) {
  const h = String(
    hash ?? (typeof window !== 'undefined' ? window.location.hash : '')
  );
  const q = h.indexOf('?');
  if (q < 0) {
    return '';
  }
  return String(new URLSearchParams(h.slice(q + 1)).get('variant') || '');
}

/**
 * Rewrite only the `variant` param, leaving `issue` and friends alone.
 *
 * @param {string} key
 */
export function writeVariant(key) {
  const h = String(window.location.hash || '#/roadmap');
  const frag = h.startsWith('#') ? h.slice(1) : h;
  const q = frag.indexOf('?');
  const path = q >= 0 ? frag.slice(0, q) : frag;
  const params = new URLSearchParams(q >= 0 ? frag.slice(q + 1) : '');
  params.set('variant', key);
  window.location.hash = `#${path}?${params.toString()}`;
}

/**
 * True only for local development hosts.
 *
 * @returns {boolean}
 */
export function isDevHost() {
  if (typeof window === 'undefined') {
    return false;
  }
  const h = String(window.location.hostname || '');
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '';
}

/**
 * @param {{ keys: string[], names: Record<string, string>, current: string }} opts
 */
export function switcherTemplate(opts) {
  if (!isDevHost()) {
    return html``;
  }
  const { keys, names, current } = opts;
  const idx = Math.max(0, keys.indexOf(current));
  /**
   * @param {number} dir
   */
  const cycle = (dir) => () => {
    const next = keys[(idx + dir + keys.length) % keys.length];
    writeVariant(next);
  };
  return html`
    <div class="proto-switcher" role="group" aria-label="Prototype variant">
      <button type="button" title="Previous variant (←)" @click=${cycle(-1)}>
        &#8249;
      </button>
      <span class="proto-switcher__label">
        <span class="proto-switcher__key">${current}</span> —
        ${names[current] || ''}
      </span>
      <button type="button" title="Next variant (→)" @click=${cycle(1)}>
        &#8250;
      </button>
    </div>
  `;
}

/**
 * Arrow keys cycle variants, except while typing.
 *
 * @param {() => string[]} getKeys
 * @param {() => string} getCurrent
 * @param {() => boolean} isActive
 * @returns {() => void} teardown
 */
export function bindArrowKeys(getKeys, getCurrent, isActive) {
  /** @param {KeyboardEvent} ev */
  const onKey = (ev) => {
    if (!isActive() || !isDevHost()) {
      return;
    }
    const key = String(ev.key || '');
    if (key !== 'ArrowLeft' && key !== 'ArrowRight') {
      return;
    }
    const target = /** @type {HTMLElement | null} */ (ev.target);
    const tag = target ? String(target.tagName || '').toLowerCase() : '';
    if (
      tag === 'input' ||
      tag === 'textarea' ||
      tag === 'select' ||
      (target && target.isContentEditable === true)
    ) {
      return;
    }
    const keys = getKeys();
    const idx = Math.max(0, keys.indexOf(getCurrent()));
    const dir = key === 'ArrowRight' ? 1 : -1;
    ev.preventDefault();
    writeVariant(keys[(idx + dir + keys.length) % keys.length]);
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
