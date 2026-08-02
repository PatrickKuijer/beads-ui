/**
 * PROTOTYPE — Variant B: "Timeline". Throwaway.
 *
 * Bet: the primary question is *when does Z land*, and the Board's navigation
 * pain is that an epic costs a whole swimlane. Here an epic costs one row and
 * one bar; you expand only the one you care about. X axis is sessions/nights,
 * so "tonight X, tomorrow Y, Z lands Thu" is readable in one glance.
 */
import { html } from 'lit-html';
import { colorForEpic } from '../../utils/epic-color.js';

export const NAME = 'Timeline';
export const DESCRIPTION = `Horizontal night axis, one bar per epic, diamond
where it lands. Expand a row for its issues.`;

/**
 * @param {{
 *   plan: any,
 *   model: { assign: (id: string, key: string) => void },
 *   gotoIssue: (id: string) => void,
 *   expanded: Set<string>,
 *   toggle: (id: string) => void
 * }} ctx
 */
export function render(ctx) {
  const { plan, gotoIssue, expanded, toggle } = ctx;
  /** @type {any[]} */
  const sessions = plan.sessions;
  const cols = sessions.length;
  /** @type {Map<string, number>} */
  const index = new Map();
  sessions.forEach((/** @type {any} */ s, /** @type {number} */ i) =>
    index.set(s.key, i)
  );

  /** @type {Map<string, string>} issue id → session key */
  const session_of = new Map();
  for (const s of sessions) {
    for (const slot of s.slots) {
      session_of.set(slot.issue.id, s.key);
    }
  }

  function axisTemplate() {
    return html`
      <div class="pb-axis" style="--cols: ${cols}">
        <div class="pb-axis__corner">
          ${plan.epics.length} epic${plan.epics.length === 1 ? '' : 's'} ·
          ${sessions.reduce(
            (/** @type {number} */ n, /** @type {any} */ s) =>
              n + s.slots.length,
            0
          )}
          open issues
        </div>
        ${sessions.map(
          (/** @type {any} */ s, /** @type {number} */ i) => html`
            <div
              class="pb-axis__cell ${i === 0
                ? 'pb-axis__cell--today'
                : ''} ${s.is_backlog ? 'pb-axis__cell--backlog' : ''}"
            >
              <strong
                >${i === 0
                  ? 'Tonight'
                  : s.is_backlog
                    ? 'Later'
                    : s.sub.split(' ')[0]}</strong
              >
              ${s.is_backlog ? 'unscheduled' : s.sub}
              <div class="mono" style="font-size:10px; color: var(--muted)">
                ${s.slots.length} queued
              </div>
            </div>
          `
        )}
      </div>
    `;
  }

  /**
   * @param {any} e
   */
  function rowTemplate(e) {
    const first = index.get(e.first_session) ?? 0;
    const last = index.get(e.last_session) ?? 0;
    const color = e.id ? colorForEpic(e.id) : 'var(--muted)';
    const span = Math.max(1, last - first + 1);
    const left = (first / cols) * 100;
    const width = (span / cols) * 100;
    const pct = e.total > 0 ? Math.round((e.closed / e.total) * 100) : 0;
    const is_open = expanded.has(e.id || '(none)');
    return html`
      <div class="pb-row" style="--cols: ${cols}">
        <div
          class="pb-row__label"
          role="button"
          tabindex="0"
          @click=${() => toggle(e.id || '(none)')}
        >
          <span class="pb-row__swatch" style="background: ${color}"></span>
          <span class="pb-row__name text-truncate">${e.title}</span>
          <span class="pb-row__count">${e.closed}/${e.total}</span>
          <span class="pb-row__count">${is_open ? '−' : '+'}</span>
        </div>
        <div class="pb-track">
          ${sessions.map(() => html`<div class="pb-track__cell"></div>`)}
          <div
            class="pb-bar"
            style="left: calc(${left}% + 4px); width: calc(${width}% - 12px); background: ${color}"
            title="${e.title} — ${e.slots.length} open"
          >
            <span class="pb-bar__fill" style="width: ${pct}%"></span>
            <span>${e.slots.length} left · ${pct}%</span>
          </div>
          ${e.unscheduled
            ? ''
            : html`<div
                class="pb-diamond"
                style="left: calc(${((last + 1) / cols) *
                100}% - 10px); background: ${color}"
                title="Lands ${e.lands ? e.lands.toDateString() : ''}"
              ></div>`}
        </div>
      </div>
      ${is_open ? childRowsTemplate(e, color) : ''}
    `;
  }

  /**
   * @param {any} e
   * @param {string} color
   */
  function childRowsTemplate(e, color) {
    return e.slots.map(
      (/** @type {any} */ slot) => html`
        <div class="pb-row pb-childrow" style="--cols: ${cols}">
          <div class="pb-row__label" @click=${() => gotoIssue(slot.issue.id)}>
            <span style="width: 8px"></span>
            <span class="mono" style="font-size:10px">${slot.issue.id}</span>
            <span class="pb-row__name text-truncate"
              >${slot.issue.title || '(no title)'}</span
            >
          </div>
          <div class="pb-track">
            ${sessions.map((/** @type {any} */ s) => {
              const here = session_of.get(slot.issue.id) === s.key;
              return html`<div class="pb-track__cell">
                ${here
                  ? html`<div
                      class="pb-child-pill"
                      style="background: color-mix(in srgb, ${color} 30%, transparent); color: var(--fg); ${slot.lane ===
                      'blocked'
                        ? 'outline: 1px dashed var(--c-blocked)'
                        : ''}"
                      @click=${() => gotoIssue(slot.issue.id)}
                    >
                      ${slot.lane === 'blocked'
                        ? 'blocked'
                        : slot.lane === 'wip'
                          ? 'wip'
                          : 'ready'}
                    </div>`
                  : ''}
              </div>`;
            })}
          </div>
        </div>
      `
    );
  }

  return html`
    <div class="proto-scroll">
      <div class="pb-grid">
        ${axisTemplate()}
        ${plan.epics.length === 0
          ? html`<div class="proto-empty">Nothing on the horizon.</div>`
          : plan.epics.map((/** @type {any} */ e) => rowTemplate(e))}
        <div class="pb-legend">
          <span
            >&#9670; projected landing = last night holding one of its
            issues</span
          >
          <span>bar fill = closed / total</span>
          <span>dashed pill = blocked</span>
        </div>
      </div>
    </div>
  `;
}
