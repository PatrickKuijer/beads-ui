/**
 * PROTOTYPE — Variant C: "Sprint board". Throwaway.
 *
 * Bet: a sprint is just a *filter*, and the cheapest fix for the Board's
 * navigation pain is to keep the kanban but show one night at a time, with
 * epics demoted from swimlanes to a colour stripe. The sprint pills double as
 * drop targets, so prepping tonight is "drag card up to Tonight".
 */
import { html } from 'lit-html';
import { colorForEpic } from '../../utils/epic-color.js';
import { createPriorityBadge } from '../../utils/priority-badge.js';
import { createTypeIcon } from '../../utils/type-icon.js';

export const NAME = 'Sprint board';
export const DESCRIPTION = `The existing kanban, scoped to one night. Epics
become colour stripes instead of swimlanes.`;

const COLUMNS = [
  { key: 'blocked', title: 'Blocked', color: 'var(--c-blocked)' },
  { key: 'ready', title: 'Ready', color: 'var(--c-ready)' },
  { key: 'wip', title: 'In progress', color: 'var(--c-inprog)' },
  { key: 'closed', title: 'Closed', color: 'var(--c-closed)' }
];

/**
 * @param {{
 *   plan: any,
 *   model: { assign: (id: string, key: string) => void },
 *   gotoIssue: (id: string) => void,
 *   selected: string,
 *   select: (key: string) => void,
 *   closedIssues: any[]
 * }} ctx
 */
export function render(ctx) {
  const { plan, model, gotoIssue, selected, select, closedIssues } = ctx;
  /** @type {any[]} */
  const sessions = plan.sessions;
  const current =
    sessions.find((/** @type {any} */ s) => s.key === selected) || sessions[0];
  /** @type {Map<string, any>} */
  const epic_by_id = new Map(
    plan.epics.map((/** @type {any} */ e) => [e.id, e])
  );

  const epics_here = new Set(
    current.slots.map((/** @type {any} */ s) => s.epic_id)
  );
  const closed_here = closedIssues.filter(
    (/** @type {any} */ it) =>
      it &&
      it.issue_type !== 'epic' &&
      epics_here.has(typeof it.epic_id === 'string' ? it.epic_id : '')
  );

  /**
   * @param {any} session
   */
  function tabTemplate(session) {
    const counts = { blocked: 0, ready: 0, wip: 0 };
    for (const slot of session.slots) {
      if (slot.lane in counts) {
        counts[/** @type {'blocked'|'ready'|'wip'} */ (slot.lane)] += 1;
      }
    }
    const total = session.slots.length || 1;
    return html`
      <div
        class="pc-tab ${session.key === current.key ? 'pc-tab--active' : ''}"
        role="button"
        tabindex="0"
        @click=${() => select(session.key)}
        @dragover=${(/** @type {DragEvent} */ ev) => {
          ev.preventDefault();
          /** @type {HTMLElement} */ (ev.currentTarget).classList.add(
            'pc-tab--drop'
          );
        }}
        @dragleave=${(/** @type {DragEvent} */ ev) => {
          /** @type {HTMLElement} */ (ev.currentTarget).classList.remove(
            'pc-tab--drop'
          );
        }}
        @drop=${(/** @type {DragEvent} */ ev) => {
          ev.preventDefault();
          /** @type {HTMLElement} */ (ev.currentTarget).classList.remove(
            'pc-tab--drop'
          );
          const id = ev.dataTransfer?.getData('text/plain');
          if (id) {
            model.assign(id, session.key);
          }
        }}
      >
        <span class="pc-tab__label">${session.label}</span>
        <span class="pc-tab__sub"
          >${session.sub} · ${session.slots.length}</span
        >
        <span class="pc-tab__bars">
          <i
            style="background: var(--c-blocked); flex: ${counts.blocked /
            total}"
          ></i>
          <i
            style="background: var(--c-ready); flex: ${counts.ready / total}"
          ></i>
          <i
            style="background: var(--c-inprog); flex: ${counts.wip / total}"
          ></i>
        </span>
      </div>
    `;
  }

  /**
   * @param {{ key: string, title: string, color: string }} col
   */
  function columnTemplate(col) {
    /** @type {any[]} */
    const items =
      col.key === 'closed'
        ? closed_here.map((/** @type {any} */ it) => ({
            issue: it,
            lane: 'closed',
            epic_id: typeof it.epic_id === 'string' ? it.epic_id : ''
          }))
        : current.slots.filter((/** @type {any} */ s) => s.lane === col.key);
    return html`
      <div class="pc-col">
        <div class="pc-col__head">
          <span class="pc-col__swatch" style="background: ${col.color}"></span>
          ${col.title}
          <span class="pc-card__spacer"></span>
          <span class="mono" style="color: var(--muted)">${items.length}</span>
        </div>
        <div class="pc-col__body">
          ${items.length === 0
            ? html`<div class="muted" style="font-size:11px">—</div>`
            : items.map((/** @type {any} */ s) => cardTemplate(s))}
        </div>
      </div>
    `;
  }

  /**
   * @param {any} slot
   */
  function cardTemplate(slot) {
    const it = slot.issue;
    const color = slot.epic_id ? colorForEpic(slot.epic_id) : 'var(--muted)';
    const epic = epic_by_id.get(slot.epic_id);
    return html`
      <article
        class="pc-card"
        style="border-left-color: ${color}"
        draggable="true"
        @dragstart=${(/** @type {DragEvent} */ ev) => {
          if (ev.dataTransfer) {
            ev.dataTransfer.setData('text/plain', it.id);
            ev.dataTransfer.effectAllowed = 'move';
          }
        }}
        @click=${() => gotoIssue(it.id)}
      >
        <div class="pc-card__top">
          ${createTypeIcon(it.issue_type)}
          <span class="pc-card__id mono">${it.id}</span>
          <span class="pc-card__spacer"></span>
          ${createPriorityBadge(it.priority)}
        </div>
        <div class="pc-card__title text-truncate">
          ${it.title || '(no title)'}
        </div>
        <div class="pc-card__epic text-truncate">
          ${epic ? epic.title : 'No epic'}
        </div>
      </article>
    `;
  }

  function legendTemplate() {
    const list = plan.epics.filter((/** @type {any} */ e) =>
      epics_here.has(e.id)
    );
    return html`
      <div class="pc-legend">
        ${list.map(
          (/** @type {any} */ e) => html`
            <span class="pc-legend__item">
              <span
                class="pc-legend__dot"
                style="background: ${e.id
                  ? colorForEpic(e.id)
                  : 'var(--muted)'}"
              ></span>
              ${e.title}
              <span class="mono">${e.closed}/${e.total}</span>
            </span>
          `
        )}
      </div>
    `;
  }

  return html`
    <div class="pc-tabs">
      ${sessions.map((/** @type {any} */ s) => tabTemplate(s))}
    </div>
    ${legendTemplate()}
    <div class="pc-cols">${COLUMNS.map((col) => columnTemplate(col))}</div>
  `;
}
