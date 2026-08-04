import { html, render } from 'lit-html';
import { isSessionMapIssue, overlay, parseMap } from '../data/session-map.js';
import { issueHashFor } from '../utils/issue-url.js';
import { debug } from '../utils/logging.js';
import { createPriorityBadge } from '../utils/priority-badge.js';

/**
 * @typedef {import('../data/session-map.js').IssueLike} IssueLike
 * @typedef {import('../data/session-map.js').MapOverlay} MapOverlay
 * @typedef {import('../data/session-map.js').QueueItem} QueueItem
 * @typedef {import('../data/session-map.js').Trap} Trap
 */

/**
 * Sessions view: read the session map an agent published for an unattended
 * run, with what the workspace reports right now laid over it.
 *
 * The map is a document, so it is rendered as one, in the order its author
 * wrote — this view adds only what the author could not know: which queue rows
 * have since closed, which chains their closing released, and the drift
 * between the map and what its own `QUERY` would return today. The right rail
 * is the part that wants a human: the gated decisions, then that drift.
 *
 * Push-only, like Board and Epics. Map beads are found in the same four
 * status lists Board subscribes to (`tab:board:*`, kept alive for this route
 * by `main.js`); the descriptions those lists omit are then fetched per map
 * bead with an `issue-detail` subscription.
 *
 * Read-only: nothing here writes to bd.
 *
 * @param {HTMLElement} mount_element
 * @param {(id: string) => void} goto_issue - Navigate to issue detail.
 * @param {{ getState: () => any, subscribe: (fn: (s: any) => void) => () => void }} store
 * @param {{ snapshotFor?: (client_id: string) => any[], register?: (id: string, spec: any) => void, unregister?: (id: string) => void, subscribe?: (fn: () => void) => () => void }} issue_stores
 * @param {{ subscribeList?: (id: string, spec: any) => Promise<() => Promise<void>> }} [subscriptions]
 * @returns {{ load: () => Promise<void>, clear: () => void }}
 */
export function createSessionsView(
  mount_element,
  goto_issue,
  store,
  issue_stores,
  subscriptions = undefined
) {
  const log = debug('views:sessions');

  /** Detail subscriptions per map bead, so `clear()` can release them. @type {Map<string, null | (() => Promise<void>)>} */
  const detail_subs = new Map();
  /** Map bead selected in the spine; null means "the newest one". @type {string | null} */
  let selected_id = null;

  /**
   * @param {string} client_id
   * @returns {IssueLike[]}
   */
  function snapshot(client_id) {
    if (!issue_stores || typeof issue_stores.snapshotFor !== 'function') {
      return [];
    }
    const arr = issue_stores.snapshotFor(client_id);
    return Array.isArray(arr) ? arr : [];
  }

  /**
   * @returns {import('../data/session-map.js').LiveLists}
   */
  function liveLists() {
    return {
      ready: snapshot('tab:board:ready'),
      wip: snapshot('tab:board:in-progress'),
      blocked: snapshot('tab:board:blocked'),
      closed: snapshot('tab:board:closed')
    };
  }

  /**
   * Map beads across the four status lists, newest first.
   *
   * @returns {IssueLike[]}
   */
  function findMapIssues() {
    const live = liveLists();
    /** @type {Map<string, IssueLike>} */
    const by_id = new Map();
    for (const list of [live.wip, live.ready, live.blocked, live.closed]) {
      for (const it of list) {
        if (isSessionMapIssue(it)) {
          by_id.set(String(it.id), it);
        }
      }
    }
    return Array.from(by_id.values());
  }

  /**
   * List payloads carry no description, so ask for each map bead's detail.
   * Fire-and-forget: the store push re-renders when it lands.
   *
   * @param {IssueLike[] } map_issues
   */
  function ensureDetails(map_issues) {
    if (!subscriptions || typeof subscriptions.subscribeList !== 'function') {
      return;
    }
    for (const it of map_issues) {
      const id = String(it.id || '');
      if (!id || detail_subs.has(id)) {
        continue;
      }
      detail_subs.set(id, null);
      const client_id = detailClientId(id);
      const spec = { type: 'issue-detail', params: { id } };
      try {
        if (typeof issue_stores.register === 'function') {
          issue_stores.register(client_id, spec);
        }
      } catch (err) {
        log('register map detail store failed %s: %o', id, err);
      }
      void subscriptions
        .subscribeList(client_id, spec)
        .then((unsub) => {
          detail_subs.set(id, unsub);
        })
        .catch((err) => {
          log('map detail subscribe failed %s: %o', id, err);
          detail_subs.delete(id);
        });
    }
  }

  /** @param {string} id */
  function detailClientId(id) {
    return `session-map:${id}`;
  }

  /**
   * Parse every discovered map bead and overlay the live lists. Beads whose
   * description has not arrived yet are skipped; beads that arrived and do not
   * conform are kept, so the reason shows up on screen.
   *
   * @returns {MapOverlay[]}
   */
  function build() {
    const map_issues = findMapIssues();
    ensureDetails(map_issues);
    const live = liveLists();

    /** @type {MapOverlay[]} */
    const views = [];
    for (const it of map_issues) {
      const detail = snapshot(detailClientId(String(it.id)))[0];
      const full = detail && detail.description ? detail : it;
      if (!full.description) {
        continue;
      }
      views.push(overlay(parseMap({ ...full, id: String(it.id) }), live));
    }
    // Newest first; a map with no date sorts last rather than at the top.
    views.sort((a, b) => (b.map.date || '').localeCompare(a.map.date || ''));
    return views;
  }

  /**
   * @param {MapOverlay[]} views
   * @returns {MapOverlay | null}
   */
  function selectedView(views) {
    if (!views.length) {
      return null;
    }
    return views.find((v) => v.map.id === selected_id) || views[0];
  }

  /**
   * @param {string} id
   * @returns {import('lit-html').TemplateResult}
   */
  function idLink(id) {
    return html`<a
      class="sm-id mono"
      href=${issueHashFor('sessions', id)}
      @click=${
        /** @param {MouseEvent} ev */ (ev) => {
          ev.preventDefault();
          goto_issue(id);
        }
      }
      >${id}</a
    >`;
  }

  /** @param {import('../data/session-map.js').LiveState} state */
  function dot(state) {
    return html`<span
      class="sm-dot sm-dot--${state}"
      title=${state}
      aria-hidden="true"
    ></span>`;
  }

  /**
   * @param {MapOverlay[]} views
   * @param {MapOverlay} current
   */
  function spineTemplate(views, current) {
    return html`
      <aside class="sm-spine">
        <div class="sm-spine__title">Sessions</div>
        ${views.map((v) => {
          const m = v.map;
          const pct = m.queue.length
            ? Math.round((v.done / m.queue.length) * 100)
            : 0;
          const is_current = m.id === current.map.id;
          return html`
            <button
              type="button"
              class="sm-spine__item ${is_current
                ? 'sm-spine__item--active'
                : ''}"
              aria-current=${is_current ? 'true' : 'false'}
              @click=${() => {
                selected_id = m.id;
                doRender();
              }}
            >
              <span class="sm-spine__row">
                <span class="sm-spine__date mono">${m.date || 'no date'}</span>
                ${m.status === 'closed'
                  ? html`<span class="sm-chip sm-chip--ready">done</span>`
                  : html`<span class="sm-chip sm-chip--wip">live</span>`}
              </span>
              <span class="sm-spine__meta mono">
                ${v.done}/${m.queue.length} closed
                ${m.decisions.length
                  ? html`·
                      <span class="sm-gated">${m.decisions.length} gated</span>`
                  : ''}
              </span>
              <span class="sm-spine__bar"
                ><span style="width: ${pct}%"></span
              ></span>
            </button>
          `;
        })}
      </aside>
    `;
  }

  /**
   * The format contract, made visible: which version parsed, the query the
   * queue came from, and anything the validator objects to.
   *
   * @param {MapOverlay} view
   */
  function conformanceTemplate(view) {
    const { problems, version, query, machine } = view.map;
    const errors = problems.filter((p) => p.level === 'error').length;
    const warns = problems.length - errors;
    return html`
      <div class="sm-conformance">
        <span class="sm-chip ${version ? 'sm-chip--ready' : 'sm-chip--blocked'}"
          >${version ? `v${version}` : 'unreadable'}</span
        >
        ${query
          ? html`<span class="sm-conformance__q mono">${query}</span>`
          : ''}
        ${machine
          ? html`<span class="sm-conformance__q mono">machine ${machine}</span>`
          : ''}
        ${problems.length === 0
          ? html`<span class="sm-conformance__ok">conforms</span>`
          : html`<span class="sm-conformance__bad"
              >${errors} error${errors === 1 ? '' : 's'} · ${warns}
              warning${warns === 1 ? '' : 's'}</span
            >`}
        ${problems.map(
          (p) =>
            html`<span
              class="sm-conformance__item sm-conformance__item--${p.level}"
              >${p.message}</span
            >`
        )}
      </div>
    `;
  }

  /**
   * @param {MapOverlay} view
   * @param {QueueItem} q
   * @param {{ overflow?: boolean, next?: boolean }} [opts]
   */
  function queueRowTemplate(view, q, opts = {}) {
    const traps = view.traps_by_id.get(q.id) || [];
    return html`
      <li
        class="sm-queue__item sm-queue__item--${q.live} ${opts.overflow
          ? 'sm-queue__item--overflow'
          : ''} ${opts.next ? 'sm-queue__item--next' : ''}"
      >
        <span class="sm-queue__n mono">${q.n}</span>
        ${opts.overflow ? '' : dot(q.live)} ${idLink(q.id)}
        ${createPriorityBadge(q.priority)}
        <span class="sm-queue__title text-truncate">${q.title}</span>
        ${traps.map(
          (t) =>
            html`<span class="sm-chip sm-chip--blocked" title=${t.body}
              >&#9888; ${t.title}</span
            >`
        )}
        ${opts.next
          ? html`<span class="sm-chip sm-chip--wip">next up</span>`
          : ''}
      </li>
      ${q.brief ? html`<li class="sm-brief">${q.brief}</li>` : ''}
    `;
  }

  /** @param {MapOverlay} view */
  function queueTemplate(view) {
    const { map } = view;
    return html`
      <section class="sm-block">
        <h3 class="sm-h">
          Queue — execution order
          <span class="sm-h__sub mono"
            >${view.done} closed · ${view.running} running · ${view.remaining}
            left</span
          >
        </h3>
        ${map.runway ? html`<p class="sm-runway">${map.runway}</p>` : ''}
        <ol class="sm-queue">
          ${map.queue.map((q) =>
            queueRowTemplate(view, q, {
              next: Boolean(view.next && view.next.id === q.id)
            })
          )}
        </ol>
      </section>
    `;
  }

  /** @param {MapOverlay} view */
  function overflowTemplate(view) {
    if (!view.map.overflow.length) {
      return '';
    }
    return html`
      <section class="sm-block">
        <h3 class="sm-h">
          Overflow
          <span class="sm-h__sub mono">only if the queue closed clean</span>
        </h3>
        <ol class="sm-queue">
          ${view.map.overflow.map((q) =>
            queueRowTemplate(view, q, { overflow: true })
          )}
        </ol>
      </section>
    `;
  }

  /** @param {MapOverlay} view */
  function chainsTemplate(view) {
    const { map } = view;
    if (!map.chains.length) {
      return '';
    }
    /** @type {Map<string, string>} */
    const state_of = new Map(map.queue.map((q) => [q.id, q.live]));
    return html`
      <section class="sm-block">
        <h3 class="sm-h">
          Chains that open mid-session
          <span class="sm-h__sub mono"
            >${view.opened_chains.length}/${map.chains.length} opened</span
          >
        </h3>
        ${map.chains.map((chain) => {
          const opened = state_of.get(chain[0]) === 'closed';
          return html`
            <div class="sm-chain ${opened ? 'sm-chain--open' : ''}">
              ${chain.map(
                (id, i) => html`
                  ${i > 0 ? html`<span class="sm-chain__arrow">›</span>` : ''}
                  <span class="sm-chain__node">${idLink(id)}</span>
                `
              )}
              ${opened
                ? html`<span class="sm-chip sm-chip--ready">released</span>`
                : ''}
            </div>
          `;
        })}
      </section>
    `;
  }

  /** @param {MapOverlay} view */
  function trapsTemplate(view) {
    if (!view.map.traps.length) {
      return '';
    }
    return html`
      <section class="sm-block">
        <h3 class="sm-h">Traps — do not rediscover the hard way</h3>
        ${view.map.traps.map(
          (t) => html`
            <div class="sm-trap">
              <div class="sm-trap__title">&#9888; ${t.title}</div>
              <div class="sm-trap__body">${t.body}</div>
              ${t.affects.length
                ? html`<div class="sm-trap__affects mono">
                    affects ${t.affects.map((id) => html`${idLink(id)} `)}
                  </div>`
                : ''}
            </div>
          `
        )}
      </section>
    `;
  }

  /** @param {MapOverlay} view */
  function scopeTemplate(view) {
    const { map } = view;
    if (!map.out_of_scope.length && !map.quality_gate.cmd) {
      return '';
    }
    return html`
      <section class="sm-block">
        ${map.out_of_scope.length
          ? html`<h3 class="sm-h">
                Out of scope
                <span class="sm-h__sub mono">deliberately not queued</span>
              </h3>
              ${map.out_of_scope.map(
                (e) => html`
                  <div class="sm-entry">
                    ${idLink(e.id)}
                    <span class="sm-entry__text">${e.text}</span>
                  </div>
                `
              )}`
          : ''}
        ${map.quality_gate.cmd
          ? html`<div class="sm-qgate mono">
              <strong>quality gate</strong> ${map.quality_gate.cmd}
              ${map.quality_gate.expect
                ? html`— ${map.quality_gate.expect}`
                : ''}
            </div>`
          : ''}
      </section>
    `;
  }

  /**
   * @param {string} title
   * @param {string} body
   */
  function proseTemplate(title, body) {
    if (!body) {
      return '';
    }
    return html`
      <section class="sm-block">
        <h3 class="sm-h">${title}</h3>
        <p class="sm-prose">${body}</p>
      </section>
    `;
  }

  /** @param {MapOverlay} view */
  function outcomeTemplate(view) {
    const out = view.map.outcome;
    if (!out) {
      return '';
    }
    return html`
      <section class="sm-block">
        <h3 class="sm-h">
          Outcome
          <span class="sm-h__sub mono">${out.closed} closed</span>
        </h3>
        <div class="sm-outcome mono">
          ${out.commits ? html`<div>commits ${out.commits}</div>` : ''}
          ${out.suite ? html`<div>suite ${out.suite}</div>` : ''}
          ${out.opened.length
            ? html`<div>
                opened ${out.opened.map((id) => html`${idLink(id)} `)}
              </div>`
            : ''}
        </div>
        ${out.followups.length
          ? html`<div class="sm-followups">
              <div class="sm-h__sub mono">
                ${out.followups.length}
                follow-up${out.followups.length === 1 ? '' : 's'} found by doing
                the work
              </div>
              ${out.followups.map(
                (f) => html`
                  <div class="sm-entry">
                    ${idLink(f.id)}
                    <span class="sm-entry__p mono">P${f.priority}</span>
                    <span class="sm-entry__text">${f.text}</span>
                  </div>
                `
              )}
            </div>`
          : ''}
      </section>
    `;
  }

  /** @param {MapOverlay} view */
  function driftTemplate(view) {
    const { map } = view;
    if (!view.drift_applies) {
      return html`<div class="sm-rail__ok">
        ${map.status === 'closed'
          ? 'Session closed — drift is only checked against a map that is still the plan.'
          : 'Drift check idle — no id in this map matches this workspace.'}
      </div>`;
    }
    if (!view.ready_not_in_map.length && !view.missing_from_live.length) {
      return html`<div class="sm-rail__ok">Map and live queue agree.</div>`;
    }
    return html`
      ${view.ready_not_in_map.length
        ? html`<div class="sm-drift">
            <strong>${view.ready_not_in_map.length}</strong> ready and ungated,
            not in the map
            ${view.ready_not_in_map.map(
              (it) =>
                html`<div class="sm-drift__row">
                  ${idLink(String(it.id))}
                  <span class="text-truncate">${it.title || ''}</span>
                </div>`
            )}
          </div>`
        : ''}
      ${view.missing_from_live.length
        ? html`<div class="sm-drift sm-drift--warn">
            <strong>${view.missing_from_live.length}</strong> in the map but in
            no live list — re-triaged, or scoped to another machine?
            ${view.missing_from_live.map(
              (q) => html`<div class="sm-drift__row">${idLink(q.id)}</div>`
            )}
          </div>`
        : ''}
    `;
  }

  /** @param {MapOverlay} view */
  function railTemplate(view) {
    const { map } = view;
    return html`
      <aside class="sm-rail">
        <div class="sm-rail__title">
          Needs you
          <span class="sm-rail__count">${map.decisions.length}</span>
        </div>
        <div class="sm-rail__note">
          Gate is a single label:
          <span class="mono sm-gate">${map.gate || '—'}</span>
        </div>
        ${map.decisions.length
          ? map.decisions.map(
              (d) => html`
                <div class="sm-decision">
                  <div class="sm-decision__head">${idLink(d.id)}</div>
                  <div class="sm-decision__text">${d.text}</div>
                </div>
              `
            )
          : html`<div class="sm-rail__ok">
              Nothing is waiting on a decision.
            </div>`}
        <div class="sm-rail__title sm-rail__title--drift">
          Drift vs <span class="mono">${map.query || 'bd ready'}</span>
        </div>
        ${driftTemplate(view)}
      </aside>
    `;
  }

  function emptyTemplate() {
    return html`
      <div class="sm-empty">
        <p>No session maps in this workspace.</p>
        <p class="muted">
          A prep agent publishes one per unattended run: a bead labelled
          <span class="mono">session-map</span> whose description starts with
          <span class="mono">SESSION MAP v1</span> — the queue in execution
          order, the chains that open mid-session, the single gate label, and
          the traps the next agent must not rediscover. This view reads it and
          lays today's status over it.
        </p>
      </div>
    `;
  }

  function template() {
    const views = build();
    const view = selectedView(views);
    if (!view) {
      return emptyTemplate();
    }
    const { map } = view;
    return html`
      <div class="sm-layout">
        ${spineTemplate(views, view)}
        <main class="sm-doc">
          <header class="sm-doc__head">
            ${idLink(map.id)}
            <span class="sm-doc__title">${map.title}</span>
          </header>
          ${conformanceTemplate(view)}
          ${proseTemplate('Since the last map', map.since)}
          ${map.queue.length ? queueTemplate(view) : ''}
          ${overflowTemplate(view)} ${chainsTemplate(view)}
          ${trapsTemplate(view)} ${scopeTemplate(view)}
          ${proseTemplate('When the gate fails', map.on_failure)}
          ${outcomeTemplate(view)}
          ${proseTemplate('Acceptance', map.acceptance)}
        </main>
        ${railTemplate(view)}
      </div>
    `;
  }

  function doRender() {
    render(template(), mount_element);
  }

  function isActive() {
    try {
      return store.getState().view === 'sessions';
    } catch {
      return false;
    }
  }

  if (issue_stores && typeof issue_stores.subscribe === 'function') {
    issue_stores.subscribe(() => {
      if (isActive()) {
        doRender();
      }
    });
  }

  return {
    async load() {
      doRender();
    },
    clear() {
      mount_element.replaceChildren();
      for (const [id, unsub] of detail_subs) {
        if (unsub) {
          void unsub().catch(() => {});
        }
        try {
          if (typeof issue_stores.unregister === 'function') {
            issue_stores.unregister(detailClientId(id));
          }
        } catch (err) {
          log('unregister map detail store failed %s: %o', id, err);
        }
      }
      detail_subs.clear();
    }
  };
}
