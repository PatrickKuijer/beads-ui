# Handoff: Beads Issue Tracker — UI Redesign (Board with Epic Swimlanes)

## Overview

A visual redesign of a local UI for the **Beads** (`bd`) graph issue tracker — a
replacement look-and-feel for the existing `beads-ui` (bdui) tool. It presents
beads issues across four views (Board, Epics, Issues, Detail) styled after
**Visual Studio / VS Code** color themes, with light+dark support. The headline
new feature vs. today's bdui is a **Kanban board that groups issues into epic
swimlanes** (including an "un-epic'd" lane), on top of the existing Blocked /
Ready / In progress / Closed columns.

## About the Design Files

The file in this bundle (`Beads Board.dc.html`) is a **design reference created
in HTML** — a working prototype showing the intended look and behavior. It is
**not production code to copy directly**. It's authored as a self-contained
"Design Component" (a streaming-HTML format with a small custom runtime); ignore
that wrapper. The task is to **recreate this design in the beads-ui codebase's
existing environment** (JavaScript + CSS, per `mantoni/beads-ui`, which is
vanilla JS/CSS — no framework), using its established patterns, its live `bd`
data feed, and its keyboard-navigation conventions. If you instead target a
fresh app, pick an appropriate framework and reproduce the same
visuals/behavior.

The prototype's data is **static sample data** modeled on a real `bd export` (a
TwinCAT VS-extension project, `TcAgentPlugin`). In the real app, wire these
views to the live beads database exactly as bdui does today (`bd` CLI JSON
output / the file-watch feed).

## Fidelity

**High-fidelity (hifi).** Final colors, typography, spacing, radii, and
interactions are all intended as shown. Recreate pixel-closely using the
codebase's own DOM/CSS. Exact tokens are listed under **Design Tokens** below.

---

## Data Model (maps to beads)

Each issue used by the UI:

- `id` — full bead id, e.g. `TcAgentPlugin-l9s.3`. UI shows a **short id**
  (strip the `<project>-` prefix → `l9s.3`). Hierarchical dotted ids denote epic
  children (`<epic>.<n>`).
- `title`, `description`, `acceptance_criteria` (`ac`), `close_reason`
- `issue_type` — one of `bug | task | feature | epic` (epics are lanes/rows,
  never cards)
- `priority` — integer `0..3` → labels **P0..P3**
- **column** (derived, board placement): `blocked | ready | inprog | closed`.
  Map from beads status: `closed`→closed, `in_progress`→inprog,
  open-with-open-blockers→blocked, open-ready (no open blockers)→ready. (bdui
  already computes ready/blocked; reuse it.)
- `ep` — parent epic id or `null` (null → "No epic" swimlane)
- `assignee`, `owner`/reporter, `created_at`, `updated_at`, `dependent_count`
- `dependencies[]` — `{ id, rel }` where
  `rel ∈ { blocks, parent-child, related }`

---

## Screens / Views

Global chrome (all views):

- **Activity bar** (left, `52px`, `--activity` bg): app logo tile (30×30,
  rounded 7px, gradient `--accent`→`#7b5cff`); three nav icon-buttons (Board /
  Epics / Issues), 40×40, radius 8px, active = `rgba(255,255,255,.12)` bg +
  white icon + a 3px `--accent` bar at its left edge; a spacer; a
  **theme-toggle** button at the bottom (sun in dark mode, moon in light).
- **Header** (top, `44px`, `--bg-2`, bottom border `--border`): project name
  (600/13px `--text-bright`) + issue count (11px mono `--text-dim`); a segmented
  **tab group** (Board/Epics/Issues) duplicating nav (active tab = `--accent`
  fill, white text); flex spacer; **search box** (210px, radius 8px, magnifier
  icon, placeholder "Search id or title…"); four **priority filter chips** P0–P3
  (mono 10.5px, toggle on/off — off = dim/greyed); a **Hide closed / Show
  closed** toggle button.

### 1. Board (default)

- **Purpose**: triage/track work as a Kanban grouped by epic.
- **Layout**: horizontally scrolls; `min-width:940px`. A sticky **column-header
  row** (`repeat(4, 1fr)`, gap `--board-gap`=14px, padding `12px 18px`, `--bg`
  bg, bottom border) showing each column's colored square (9px, radius 3px),
  label (600/12px), and a pill count. Below it, a stack of **swimlanes**.
- **Swimlane** = one epic (plus a final "No epic · orphan issues" lane):
  - **Lane header** (sticky under column header at `top:57px`, `--bg-2`, cursor
    pointer to collapse): rotating caret (0°→90°), a 22px rounded tile tinted
    with the epic color (`color-mix(in srgb, <epicColor> 20%, transparent)`,
    icon in `<epicColor>`), the epic short id (mono 11px in epic color), epic
    title (600/13px, ellipsis, max-width 44%), an epic **P-badge** (outlined),
    spacer, a **progress bar** (120×6px track `--bg-3`, fill `--c-closed` width
    = %closed), and `done/total done` (11px mono dim).
  - **Lane body** (when expanded): `repeat(4,1fr)` grid, gap `--board-gap`,
    padding `12px 18px 16px`. Each of the 4 cells is a **drop zone** (min-height
    52px, radius 10px; while a card is dragged over it, bg =
    `color-mix(in srgb, var(--accent) 12%, transparent)`).
- **Card** (soft style): `--card-bg` (=`--card-soft`), 1px `--border`, **3px
  left border in the priority color**, radius 11px, padding `13px 14px`, shadow
  `0 1px 2px var(--shadow), 0 2px 6px var(--shadow)`; `cursor:grab`; hover →
  border `--accent`; while being dragged, `opacity:.4`.
  - Row 1: type icon (in `--tc`), short id (mono 11px dim), spacer, **P-badge**
    (mono 9.5px, color = priority, bg = `color-mix(... 16%)`, radius 5px).
  - Body: title, 12.5px/1.4, clamped to 3 lines (`-webkit-line-clamp:3`).
  - Row 2: status pill (7px dot + label in the column color; the **In progress**
    dot pulses via `@keyframes pulse` 1.6s), spacer, dependency count with a
    small link icon (only if deps > 0).
  - Click a card → opens the **Detail** drawer.

### 2. Epics (progress per epic)

- **Purpose**: portfolio view of epic progress.
- **Layout**: centered column, `max-width:1000px`, padding `22px 24px 48px`. One
  rounded card per epic (1px `--border`, radius 12px, `--bg-2`).
  - Header row (click to expand): 30px tinted epic-color tile w/ icon; short
    id + P-badge + epic status label; epic title (600/14px); a right block
    (`220px`) with counts (`N blkd` / `N ready` / `N wip` / `done/total`, mono
    10.5px, colored) over a **split progress bar** (7px: `--c-closed` segment
    for done + `--c-inprog` segment for wip); a rotating caret.
  - Expanded: child issues as compact rows (status dot, type icon, short id
    `74px`, title ellipsis, P-badge, status label). Row click → Detail.

### 3. Issues (list)

- **Purpose**: flat, searchable/filterable table of all issues.
- **Layout**: full-width grid, columns `34px 108px 1fr 150px 58px 128px` = [type
  icon | ID | Title | Epic | Prio | Status]. Sticky header row (uppercase 10.5px
  dim labels). Rows: type icon, short id (mono 11.5px `--accent`), title (13px
  ellipsis), epic short id (mono 11px dim), P-badge, status (dot + label). Hover
  → `--bg-hover`; selected row → `--sel`. Row click → Detail.

### 4. Issue Detail (overlay drawer)

- **Purpose**: full issue info; opens from any view.
- **Behavior**: a **fixed right-side overlay** (`440px`, full height, `--bg-2`,
  left border, shadow `-8px 0 24px var(--shadow)`, slide-in `@keyframes slidein`
  .18s) over a `rgba(0,0,0,.35)` backdrop; clicking the backdrop or the ✕ closes
  it. It overlays (does not shrink) the underlying view.
- **Contents**: header (type icon, full id, P-badge, status pill, close ✕);
  title (600/17px); a chip row — clickable **epic chip** (navigates to Epics and
  expands that epic), a `type` chip, and an **assignee** chip (16px avatar with
  initials) when assigned; **Description** (pre-wrap); **Acceptance criteria**
  in a callout (`--bg-3`, left border `--c-ready`, checkmark); **Dependencies**
  as clickable rows (relation tag colored by rel, short id, title → opens that
  dependency in the drawer); **Close reason** (dim, left border `--c-closed`)
  when closed; a 2-col meta grid: Created / Updated / Reporter / Dependents.

---

## Interactions & Behavior

- **Nav / tabs**: switch `view` between `board | epics | issues`.
- **Theme toggle**: swaps `theme` `dark ⇄ light` (drives the `data-theme`
  attribute on the root; all tokens are CSS variables).
- **Collapse/expand swimlanes** (board) and **expand epics** (epics view):
  per-lane/-epic open state.
- **Drag & drop** (board): cards are `draggable`. On drop into a cell, set the
  issue's **column** to that cell's column **and** its **epic** to that lane's
  epic (dropping into another swimlane reassigns the epic; dropping into "No
  epic" clears it). In the real app, translate these to `bd` mutations (e.g.
  status/claim/close for column moves; `bd dep add/remove` parent-child for epic
  reassignment). Show the drop-zone highlight during dragover; dim the dragged
  card to `.4`.
- **Filters**: priority chips (multi-toggle), free-text search over id+title
  (case-insensitive), and Hide-closed. Filtering also hides now-empty swimlanes
  only while a search is active.
- **Transitions**: caret rotate .15s; card border-color .12s; button bg .12s;
  drawer/backdrop slide-in .18s; in-progress status dot pulses.
- **Responsive**: board scrolls horizontally below ~940px; detail drawer is a
  fixed overlay so it never squeezes the underlying columns.

## State Management

- `theme` (`dark|light`), `view` (`board|epics|issues`)
- `search` (string), `hideClosed` (bool), `prio` (map `{0,1,2,3}→bool`)
- `laneOpen` (map epicId→open, default open), `epicOpen` (map epicId→open,
  default closed)
- `selected` (issue id | null → detail drawer), `dragId` (id being dragged),
  `dragOverCol` (`"<laneKey>|<colKey>"` for highlight)
- `issues` (the working list; drag mutates `column` + `ep`).
- Data source: replace the static array with the **live `bd` feed** bdui already
  uses; keep the derived ready/blocked logic.

## Design Tokens

Dark (VS Code "Dark+"):

```
--bg:#1e1e1e  --bg-2:#252526  --bg-3:#2d2d30  --bg-hover:#2a2d2e  --activity:#333333
--border:#3c3c3c  --border-2:#454545
--text:#d4d4d4  --text-dim:#8a8a8a  --text-bright:#ffffff
--accent:#3794ff  --accent-hover:#4ea1ff  --accent-fg:#ffffff
--sel:#04395e  --card-soft:#252526  --scroll:#4a4a4a  --shadow:rgba(0,0,0,.4)
--p0:#f14c4c  --p1:#e0983a  --p2:#3794ff  --p3:#8a8a8a
--t-bug:#f14c4c  --t-task:#4fc1ff  --t-feature:#c586c0
--c-blocked:#f14c4c  --c-ready:#4ec990  --c-inprog:#3794ff  --c-closed:#8a8a8a
```

Light (VS Code "Light+"):

```
--bg:#ffffff  --bg-2:#f3f3f3  --bg-3:#f8f8f8  --bg-hover:#eaeaea  --activity:#2c2c2c
--border:#e5e5e5  --border-2:#d4d4d4
--text:#3b3b3b  --text-dim:#6e6e6e  --text-bright:#000000
--accent:#0066bf  --accent-hover:#0a5ca8  --accent-fg:#ffffff
--sel:#cbe2f7  --card-soft:#ffffff  --scroll:#c4c4c4  --shadow:rgba(0,0,0,.12)
--p0:#e01e1e  --p1:#bf7415  --p2:#0066bf  --p3:#8a8a8a
--t-bug:#e01e1e  --t-task:#0f7dc4  --t-feature:#a626a4
--c-blocked:#e01e1e  --c-ready:#288e5a  --c-inprog:#0066bf  --c-closed:#8a8a8a
```

Soft-card layout tokens (the only card style; the earlier "dense" variant was
removed):

```
--card-radius:11px  --card-pad:13px 14px  --board-gap:14px  --lane-gap:12px  --card-gap:11px
--card-shadow:0 1px 2px var(--shadow), 0 2px 6px var(--shadow)  --card-bg:var(--card-soft)
```

- **Typography**: UI = system stack
  (`-apple-system, "Segoe UI", system-ui, sans-serif`). All ids, priority
  labels, counts, and metrics use a **monospace** face — prototype uses
  **JetBrains Mono** (Google Fonts, weights 400/500/600); substitute Cascadia
  Code/Mono to match VS if preferred.
- **Sizes**: title 17px (detail) / 14px (epic) / 13px (nav+card headers) /
  12.5px (card/list body); labels 10.5–11px; badges 9.5–10px.
- **Priority→color**: P0 `--p0`, P1 `--p1`, P2 `--p2`, P3 `--p3`.
  **Type→color**: bug `--t-bug`, task `--t-task`, feature `--t-feature`, epic
  uses a per-epic accent color. **Column→color**:
  `--c-blocked/-ready/-inprog/-closed`.

## Assets

No external images. All icons are **inline SVG** drawn in-file (nav
board/epics/issues, sun/moon theme, type glyphs bug/task/feature, epic "layers",
carets, search, close, checkmark, dependency link). Feel free to swap for **VS
Code Codicons** in the real app for authenticity. App logo is a small
CSS-gradient tile with an inline "beads" SVG.

## Files

- `Beads Board.dc.html` — the full interactive prototype (all four views, both
  themes, drag/drop, filters, detail drawer). Open in a browser to interact. The
  `<style>` block at the top holds the exact token values and keyframes; the
  logic class holds the state model and the sample data array.
