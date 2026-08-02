/**
 * PROTOTYPE — Variant A: "Session Queue". Throwaway.
 *
 * Bet: an AFK night is a *run order*, not a bucket. You prep by dragging work
 * into tonight, in the order the agent should attempt it, and the thing you
 * most need to see is what will stall at 02:00 (blocked items) and what the
 * night makes land. The roadmap is the same list, read further down.
 */
import { html } from 'lit-html';
import { colorForEpic } from '../../utils/epic-color.js';
import { createTypeIcon } from '../../utils/type-icon.js';
import { formatDate } from './sprint-model.js';

export const NAME = 'Session queue';

/** @param {number | undefined} p */
function prioColor(p) {
  const n = Number.isFinite(Number(p)) ? Number(p) : 2;
  return `var(--p${Math.max(0, Math.min(3, n))})`;
}

/** @param {'blocked'|'ready'|'wip'|'closed'} lane */
function laneChip(lane) {
  if (lane === 'blocked') {
    return html`<span class="proto-chip proto-chip--blocked">stalls</span>`;
  }
  if (lane === 'wip') {
    return html`<span class="proto-chip proto-chip--wip">wip</span>`;
  }
  return '';
}

/**
 * @param {{
 *   plan: any,
 *   model: { assign: (id: string, key: string) => void },
 *   gotoIssue: (id: string) => void
 * }} ctx
 */
export function render(ctx) {
  const { plan, model, gotoIssue } = ctx;
  const nights = plan.sessions.filter((/** @type {any} */ s) => !s.is_backlog);
  const backlog = plan.sessions.find((/** @type {any} */ s) => s.is_backlog);
  /** @type {Map<string, any>} */
  const epic_by_id = new Map(
    plan.epics.map((/** @type {any} */ e) => [e.id, e])
  );

  /**
   * @param {DragEvent} ev
   * @param {string} id
   */
  function onDragStart(ev, id) {
    if (ev.dataTransfer) {
      ev.dataTransfer.setData('text/plain', id);
      ev.dataTransfer.effectAllowed = 'move';
    }
  }

  /**
   * @param {string} drop_class
   */
  function dropHandlers(drop_class) {
    return {
      /** @param {DragEvent} ev */
      over: (ev) => {
        ev.preventDefault();
        const el = /** @type {HTMLElement} */ (ev.currentTarget);
        el.classList.add(drop_class);
      },
      /** @param {DragEvent} ev */
      leave: (ev) => {
        const el = /** @type {HTMLElement} */ (ev.currentTarget);
        el.classList.remove(drop_class);
      }
    };
  }

  /**
   * @param {any} session
   */
  function sessionTemplate(session) {
    const slots = session.slots;
    const stalls = slots.filter((/** @type {any} */ s) => s.lane === 'blocked');
    const epics_touched = new Set(
      slots.map((/** @type {any} */ s) => s.epic_id)
    );
    const lands = plan.epics.filter(
      (/** @type {any} */ e) => e.last_session === session.key && !e.unscheduled
    );
    const h = dropHandlers('pa-session--drop');
    return html`
      <section
        class="pa-session ${session.key === 'night-0'
          ? 'pa-session--tonight'
          : ''}"
        @dragover=${h.over}
        @dragleave=${h.leave}
        @drop=${(/** @type {DragEvent} */ ev) => {
          ev.preventDefault();
          const el = /** @type {HTMLElement} */ (ev.currentTarget);
          el.classList.remove('pa-session--drop');
          const id = ev.dataTransfer?.getData('text/plain');
          if (id) {
            model.assign(id, session.key);
          }
        }}
      >
        <header class="pa-session__head">
          <span class="pa-session__label">${session.label}</span>
          <span class="pa-session__date">${session.sub}</span>
          <span class="pa-session__spacer"></span>
          <span class="pa-session__meta">
            ${slots.length} issue${slots.length === 1 ? '' : 's'} ·
            ${epics_touched.size} epic${epics_touched.size === 1 ? '' : 's'}
          </span>
          ${stalls.length > 0
            ? html`<span class="pa-session__meta pa-session__warn"
                >&#9888; ${stalls.length} blocked</span
              >`
            : ''}
        </header>
        ${slots.length === 0
          ? html`<div class="pa-session__empty">
              Nothing queued. Drag work here to prep this night.
            </div>`
          : html`<ol class="pa-run">
              ${slots.map((/** @type {any} */ slot, /** @type {number} */ i) =>
                runItemTemplate(slot, i)
              )}
            </ol>`}
        ${lands.length > 0
          ? html`<div class="pa-session__foot">
              &#9873; Lands this night:
              ${lands.map((/** @type {any} */ e) => e.title).join(' · ')}
            </div>`
          : ''}
      </section>
    `;
  }

  /**
   * @param {any} slot
   * @param {number} i
   */
  function runItemTemplate(slot, i) {
    const it = slot.issue;
    const epic = epic_by_id.get(slot.epic_id);
    const color = slot.epic_id ? colorForEpic(slot.epic_id) : 'var(--muted)';
    return html`
      <li
        class="pa-run__item"
        draggable="true"
        @dragstart=${(/** @type {DragEvent} */ ev) => onDragStart(ev, it.id)}
        @click=${() => gotoIssue(it.id)}
      >
        <span class="pa-run__n">${i + 1}</span>
        <span class="pa-run__bar" style="background: ${color}"></span>
        <span
          class="pa-run__bar"
          style="background: ${prioColor(it.priority)}"
        ></span>
        ${createTypeIcon(it.issue_type)}
        <span class="pa-run__id mono">${it.id}</span>
        <span class="pa-run__title text-truncate"
          >${it.title || '(no title)'}</span
        >
        ${laneChip(slot.lane)}
        <span class="pa-run__epic text-truncate"
          >${epic ? epic.title : '—'}</span
        >
      </li>
    `;
  }

  function trayTemplate() {
    const slots = backlog ? backlog.slots : [];
    /** @type {Map<string, any[]>} */
    const by_epic = new Map();
    for (const slot of slots) {
      const list = by_epic.get(slot.epic_id) || [];
      list.push(slot);
      by_epic.set(slot.epic_id, list);
    }
    const h = dropHandlers('pa-session--drop');
    return html`
      <aside
        class="pa-tray"
        @dragover=${h.over}
        @dragleave=${h.leave}
        @drop=${(/** @type {DragEvent} */ ev) => {
          ev.preventDefault();
          const el = /** @type {HTMLElement} */ (ev.currentTarget);
          el.classList.remove('pa-session--drop');
          const id = ev.dataTransfer?.getData('text/plain');
          if (id) {
            model.assign(id, 'backlog');
          }
        }}
      >
        <div class="pa-tray__title">Unscheduled · ${slots.length}</div>
        ${slots.length === 0
          ? html`<div class="muted" style="font-size:12px">
              Everything on the horizon is queued.
            </div>`
          : Array.from(by_epic.entries()).map(
              ([epic_id, list]) => html`
                <div class="pa-tray__group">
                  <div class="pa-tray__group-name text-truncate">
                    ${epic_by_id.get(epic_id)?.title || 'No epic'} ·
                    ${list.length}
                  </div>
                  ${list.map(
                    (/** @type {any} */ slot) => html`
                      <div
                        class="pa-tray__item"
                        draggable="true"
                        @dragstart=${(/** @type {DragEvent} */ ev) =>
                          onDragStart(ev, slot.issue.id)}
                        @click=${() => gotoIssue(slot.issue.id)}
                      >
                        <span
                          class="pa-run__bar"
                          style="background: ${epic_id
                            ? colorForEpic(epic_id)
                            : 'var(--muted)'}; height: 14px"
                        ></span>
                        <span class="mono" style="font-size:10px"
                          >${slot.issue.id}</span
                        >
                        <span class="text-truncate"
                          >${slot.issue.title || '(no title)'}</span
                        >
                      </div>
                    `
                  )}
                </div>
              `
            )}
      </aside>
    `;
  }

  function landsTemplate() {
    const landed = plan.epics
      .filter((/** @type {any} */ e) => e.slots.length > 0)
      .slice()
      .sort((/** @type {any} */ a, /** @type {any} */ b) => {
        if (!a.lands) {
          return 1;
        }
        if (!b.lands) {
          return -1;
        }
        return a.lands.getTime() - b.lands.getTime();
      });
    return html`
      <div class="pa-lands">
        <div class="pa-tray__title">Roadmap — projected landings</div>
        ${landed.map(
          (/** @type {any} */ e) => html`
            <div class="pa-lands__row">
              <span class="pa-lands__date"
                >${e.lands ? formatDate(e.lands) : 'unscheduled'}</span
              >
              <span
                class="pa-run__bar"
                style="background: ${e.id
                  ? colorForEpic(e.id)
                  : 'var(--muted)'}; height: 16px"
              ></span>
              <span class="text-truncate">${e.title}</span>
              <span class="mono" style="font-size:11px; color: var(--muted)"
                >${e.closed}/${e.total} done</span
              >
              ${e.unscheduled
                ? html`<span class="proto-chip proto-chip--blocked"
                    >needs more nights</span
                  >`
                : ''}
            </div>
          `
        )}
      </div>
    `;
  }

  return html`
    <div class="proto-scroll">
      <div class="pa-layout">
        <div>
          ${nights.map((/** @type {any} */ s) => sessionTemplate(s))}
          ${landsTemplate()}
        </div>
        ${trayTemplate()}
      </div>
    </div>
  `;
}

/** Unused here; kept so every variant module has the same shape. */
export const DESCRIPTION = `Vertical dated agenda. Drag into a night, read the
run order top-to-bottom, see what stalls and what lands.`;
