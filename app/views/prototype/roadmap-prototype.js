/**
 * PROTOTYPE — host for the sprint/roadmap variants. Throwaway.
 *
 * Question: what should a sprint / roadmap surface look like in beads-ui, so
 * prepping an AFK overnight agent session is a first-class act and the Board
 * stops being a wall of open epic swimlanes?
 *
 * Three variants on `#/roadmap`, switchable via `?variant=` and the floating
 * bottom bar. Read-only — nothing here mutates bd. See ./README.md.
 */
import { html, render } from 'lit-html';
import { createSprintModel } from './sprint-model.js';
import { injectPrototypeStyles } from './styles.js';
import { bindArrowKeys, readVariant, switcherTemplate } from './switcher.js';
import * as variant_a from './variant-a-session-queue.js';
import * as variant_b from './variant-b-timeline.js';
import * as variant_c from './variant-c-sprint-board.js';

const VARIANTS = { A: variant_a, B: variant_b, C: variant_c };
const KEYS = ['A', 'B', 'C'];
/** @type {Record<string, string>} */
const NAMES = { A: variant_a.NAME, B: variant_b.NAME, C: variant_c.NAME };

/**
 * @param {HTMLElement} mount_element
 * @param {(id: string) => void} goto_issue
 * @param {{ getState: () => any, subscribe: (fn: (s: any) => void) => () => void }} store
 * @param {{ snapshotFor?: (client_id: string) => any[], subscribe?: (fn: () => void) => () => void }} issue_stores
 */
export function createRoadmapPrototypeView(
  mount_element,
  goto_issue,
  store,
  issue_stores
) {
  injectPrototypeStyles();
  const model = createSprintModel(issue_stores);

  /** Variant B row expansion. @type {Set<string>} */
  const expanded = new Set();
  /** Variant C selected sprint. */
  let selected_sprint = 'night-0';

  function currentVariant() {
    const key = readVariant().toUpperCase();
    return KEYS.includes(key) ? key : 'A';
  }

  function isActive() {
    try {
      return store.getState().view === 'roadmap';
    } catch {
      return false;
    }
  }

  function template() {
    const key = currentVariant();
    const plan = model.plan();
    /** @type {any} */
    const variant = VARIANTS[/** @type {'A'|'B'|'C'} */ (key)];
    const closed_issues =
      issue_stores && typeof issue_stores.snapshotFor === 'function'
        ? issue_stores.snapshotFor('tab:board:closed') || []
        : [];
    const body = variant.render({
      plan,
      model,
      gotoIssue: goto_issue,
      expanded,
      toggle: (/** @type {string} */ id) => {
        if (expanded.has(id)) {
          expanded.delete(id);
        } else {
          expanded.add(id);
        }
        doRender();
      },
      selected: selected_sprint,
      select: (/** @type {string} */ k) => {
        selected_sprint = k;
        doRender();
      },
      closedIssues: closed_issues
    });

    return html`
      <div class="proto-banner">
        <span class="proto-banner__tag">PROTOTYPE</span>
        <span
          >Sprints &amp; roadmap — variant ${key} · ${NAMES[key]}. Sessions are
          auto-bucketed${plan.uses_labels ? ' (some from sprint: labels)' : ''};
          drags are in-memory only and reset on reload. Nothing is written to
          bd.</span
        >
        <span class="proto-banner__spacer"></span>
        ${model.hasOverrides()
          ? html`<button
              type="button"
              @click=${() => {
                model.reset();
              }}
            >
              Reset moves
            </button>`
          : ''}
      </div>
      ${body} ${switcherTemplate({ keys: KEYS, names: NAMES, current: key })}
    `;
  }

  function doRender() {
    render(template(), mount_element);
  }

  model.subscribe(() => {
    if (isActive()) {
      doRender();
    }
  });
  window.addEventListener('hashchange', () => {
    if (isActive()) {
      doRender();
    }
  });
  bindArrowKeys(
    () => KEYS,
    () => currentVariant(),
    isActive
  );

  return {
    async load() {
      doRender();
    },
    clear() {
      mount_element.replaceChildren();
    }
  };
}
