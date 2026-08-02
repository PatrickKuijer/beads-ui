/**
 * PROTOTYPE — injected CSS so `app/styles.css` stays untouched and the whole
 * prototype can be deleted by removing this directory. Throwaway.
 */

const CSS = `
/* The route shell is overflow:hidden, so the prototype route must be a
   flex column that hands its overflow to one scrolling child. */
.route.roadmap {
  display: flex;
  flex-direction: column;
}

/* ---- shared prototype chrome ---------------------------------------- */
.proto-banner {
  display: flex;
  align-items: center;
  gap: var(--space-6);
  padding: var(--space-3) var(--space-8);
  background: color-mix(in srgb, var(--p1) 16%, var(--panel-bg));
  border-bottom: 1px solid color-mix(in srgb, var(--p1) 40%, transparent);
  font-size: 12px;
  color: var(--fg);
  flex: 0 0 auto;
}
.proto-banner__tag {
  font-family: var(--font-mono);
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--p1);
}
.proto-banner__spacer { flex: 1; }
.proto-banner button {
  font-size: 11px;
  padding: 2px 8px;
}
.proto-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: var(--space-8) var(--space-8) 72px;
}
.proto-empty {
  padding: var(--space-10);
  color: var(--muted);
}
.proto-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-mono);
  font-size: 10px;
  padding: 1px 6px;
  border-radius: var(--badge-radius);
  white-space: nowrap;
}
.proto-chip--blocked { background: color-mix(in srgb, var(--c-blocked) 18%, transparent); color: var(--c-blocked); }
.proto-chip--ready   { background: color-mix(in srgb, var(--c-ready) 18%, transparent); color: var(--c-ready); }
.proto-chip--wip     { background: color-mix(in srgb, var(--c-inprog) 18%, transparent); color: var(--c-inprog); }

/* ---- variant switcher ------------------------------------------------ */
.proto-switcher {
  position: fixed;
  left: 50%;
  bottom: 18px;
  transform: translateX(-50%);
  z-index: 9000;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 4px 4px;
  border-radius: 999px;
  background: #111;
  color: #fff;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
  font-size: 12px;
}
.proto-switcher button {
  all: unset;
  cursor: pointer;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  color: #fff;
}
.proto-switcher button:hover { background: #333; }
.proto-switcher__label {
  padding: 0 var(--space-6);
  font-family: var(--font-mono);
  white-space: nowrap;
}
.proto-switcher__key { color: #ffd166; font-weight: 700; }

/* ---- A: session queue ------------------------------------------------ */
.pa-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: var(--space-10);
  align-items: start;
}
.pa-session {
  border: 1px solid var(--border-2);
  border-radius: 10px;
  background: var(--bg);
  margin-bottom: var(--space-8);
  overflow: hidden;
}
.pa-session--tonight { border-color: var(--c-inprog); box-shadow: 0 0 0 1px var(--c-inprog); }
.pa-session--drop { border-color: var(--c-ready); background: color-mix(in srgb, var(--c-ready) 8%, var(--bg)); }
.pa-session__head {
  display: flex;
  align-items: baseline;
  gap: var(--space-6);
  padding: var(--space-6) var(--space-8);
  border-bottom: 1px solid var(--border);
  background: var(--panel-bg-3);
}
.pa-session__label { font-weight: 700; font-size: 15px; }
.pa-session__date { color: var(--muted); font-family: var(--font-mono); font-size: 11px; }
.pa-session__spacer { flex: 1; }
.pa-session__meta { font-family: var(--font-mono); font-size: 11px; color: var(--muted); }
.pa-session__warn { color: var(--c-blocked); font-weight: 600; }
.pa-run { list-style: none; margin: 0; padding: 0; }
.pa-run__item {
  display: flex;
  align-items: center;
  gap: var(--space-5);
  padding: var(--space-4) var(--space-8);
  border-bottom: 1px solid var(--border);
  cursor: grab;
}
.pa-run__item:last-child { border-bottom: 0; }
.pa-run__item:hover { background: var(--panel-bg-3); }
.pa-run__n {
  width: 20px;
  text-align: right;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--muted);
}
.pa-run__bar { width: 3px; align-self: stretch; border-radius: 2px; }
.pa-run__id { font-family: var(--font-mono); font-size: 12px; }
.pa-run__title { flex: 1; min-width: 0; }
.pa-run__epic {
  font-size: 10px;
  color: var(--muted);
  max-width: 130px;
}
.pa-session__foot {
  padding: var(--space-4) var(--space-8);
  border-top: 1px solid var(--border);
  background: var(--panel-bg-3);
  font-size: 11px;
  color: var(--muted);
}
.pa-session__empty { padding: var(--space-8); color: var(--muted); font-size: 12px; }
.pa-tray {
  position: sticky;
  top: 0;
  border: 1px dashed var(--border-2);
  border-radius: 10px;
  padding: var(--space-6);
  background: var(--panel-bg-3);
  max-height: calc(100vh - 200px);
  overflow: auto;
}
.pa-tray__title { font-weight: 700; margin-bottom: var(--space-4); }
.pa-tray__group { margin-bottom: var(--space-6); }
.pa-tray__group-name { font-size: 11px; color: var(--muted); margin-bottom: var(--space-2); }
.pa-tray__item {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-2) var(--space-3);
  border-radius: 6px;
  background: var(--bg);
  border: 1px solid var(--border);
  margin-bottom: 3px;
  cursor: grab;
  font-size: 12px;
}
.pa-lands {
  margin-top: var(--space-10);
  border-top: 2px solid var(--border-2);
  padding-top: var(--space-8);
}
.pa-lands__row {
  display: flex;
  align-items: center;
  gap: var(--space-6);
  padding: var(--space-3) 0;
  font-size: 13px;
}
.pa-lands__date {
  font-family: var(--font-mono);
  font-size: 11px;
  width: 90px;
  color: var(--muted);
}

/* ---- B: timeline ----------------------------------------------------- */
.pb-grid { min-width: 780px; }
.pb-axis {
  display: grid;
  grid-template-columns: 240px repeat(var(--cols), minmax(80px, 1fr));
  border-bottom: 1px solid var(--border-2);
  position: sticky;
  top: 0;
  background: var(--bg);
  z-index: 2;
}
.pb-axis__corner { padding: var(--space-4) var(--space-6); font-size: 11px; color: var(--muted); }
.pb-axis__cell {
  padding: var(--space-4) var(--space-3);
  border-left: 1px solid var(--border);
  font-size: 11px;
  text-align: center;
}
.pb-axis__cell strong { display: block; font-size: 12px; }
.pb-axis__cell--today { background: color-mix(in srgb, var(--c-inprog) 12%, transparent); }
.pb-axis__cell--backlog { background: var(--panel-bg); color: var(--muted); }
.pb-row {
  display: grid;
  grid-template-columns: 240px repeat(var(--cols), minmax(80px, 1fr));
  border-bottom: 1px solid var(--border);
  min-height: 44px;
}
.pb-row:hover { background: var(--panel-bg-3); }
.pb-row__label {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-6);
  min-width: 0;
  cursor: pointer;
}
.pb-row__swatch { width: 8px; height: 22px; border-radius: 3px; flex: 0 0 auto; }
.pb-row__name { min-width: 0; font-size: 13px; }
.pb-row__count { font-family: var(--font-mono); font-size: 10px; color: var(--muted); }
.pb-track {
  grid-column: 2 / -1;
  position: relative;
  display: grid;
  grid-template-columns: repeat(var(--cols), minmax(80px, 1fr));
  align-items: center;
}
.pb-track__cell { border-left: 1px solid var(--border); height: 100%; }
.pb-bar {
  position: absolute;
  height: 20px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  padding: 0 var(--space-5);
  font-size: 10px;
  font-family: var(--font-mono);
  color: #fff;
  overflow: hidden;
  white-space: nowrap;
}
.pb-bar__fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: rgba(255, 255, 255, 0.28);
}
.pb-bar span { position: relative; }
.pb-diamond {
  position: absolute;
  width: 12px;
  height: 12px;
  transform: rotate(45deg);
  border: 2px solid var(--bg);
}
.pb-childrow { background: var(--panel-bg-3); min-height: 30px; }
.pb-child-pill {
  height: 16px;
  border-radius: 8px;
  margin: 6px 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-size: 9px;
  cursor: pointer;
  overflow: hidden;
}
.pb-legend {
  display: flex;
  gap: var(--space-8);
  padding: var(--space-6) 0;
  font-size: 11px;
  color: var(--muted);
}

/* ---- C: sprint board ------------------------------------------------- */
.pc-tabs {
  display: flex;
  gap: var(--space-4);
  padding: var(--space-6) var(--space-8) var(--space-4);
  flex: 0 0 auto;
  flex-wrap: wrap;
}
.pc-tab {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-4) var(--space-8);
  border: 1px solid var(--border-2);
  border-radius: 8px;
  background: var(--bg);
  cursor: pointer;
  min-width: 128px;
}
.pc-tab--active { border-color: var(--c-inprog); background: color-mix(in srgb, var(--c-inprog) 10%, var(--bg)); }
.pc-tab--drop { border-color: var(--c-ready); border-style: dashed; }
.pc-tab__label { font-weight: 700; font-size: 13px; }
.pc-tab__sub { font-size: 10px; color: var(--muted); font-family: var(--font-mono); }
.pc-tab__bars { display: flex; gap: 2px; height: 4px; margin-top: 4px; }
.pc-tab__bars i { display: block; height: 100%; border-radius: 2px; }
.pc-cols {
  display: grid;
  grid-template-columns: repeat(4, minmax(180px, 1fr));
  gap: var(--space-6);
  padding: 0 var(--space-8) 72px;
  flex: 1;
  min-height: 0;
  overflow: auto;
  align-items: start;
}
.pc-col {
  background: var(--panel-bg-3);
  border: 1px solid var(--border);
  border-radius: 8px;
  min-height: 120px;
}
.pc-col__head {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-6);
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  font-weight: 700;
}
.pc-col__swatch { width: 8px; height: 8px; border-radius: 999px; }
.pc-col__body { padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-4); }
.pc-card {
  background: var(--bg);
  border: 1px solid var(--border-2);
  border-left: 4px solid var(--muted);
  border-radius: 6px;
  padding: var(--space-4) var(--space-5);
  cursor: grab;
  font-size: 12px;
}
.pc-card:hover { border-color: var(--c-inprog); }
.pc-card__top { display: flex; align-items: center; gap: var(--space-3); }
.pc-card__id { font-family: var(--font-mono); font-size: 11px; }
.pc-card__spacer { flex: 1; }
.pc-card__title { margin-top: 2px; }
.pc-card__epic { margin-top: 3px; font-size: 10px; color: var(--muted); }
.pc-legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-6);
  padding: 0 var(--space-8) var(--space-6);
  font-size: 11px;
  color: var(--muted);
}
.pc-legend__item { display: inline-flex; align-items: center; gap: 4px; }
.pc-legend__dot { width: 8px; height: 8px; border-radius: 2px; }
`;

let injected = false;

/** Inject the prototype stylesheet once. */
export function injectPrototypeStyles() {
  if (injected || typeof document === 'undefined') {
    return;
  }
  injected = true;
  const el = document.createElement('style');
  el.id = 'prototype-roadmap-styles';
  el.textContent = CSS;
  document.head.appendChild(el);
}
