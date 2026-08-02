# PROTOTYPE — Sprints & Roadmap

> Throwaway code. Not shipped, not tested, not abstracted. Lives on the
> `prototype/roadmap-sprints` branch only. Tracked by **UI-r429**.

## The question

> What should a sprint / roadmap surface look like in beads-ui, so that (a)
> prepping an AFK overnight agent session is a first-class act, and (b) the
> Board stops being a wall of open epic swimlanes?

## The plan

Three radically different variants of a sprint/roadmap surface, rendered on a
throwaway `#/roadmap` route, switchable via `?variant=` in the hash and a
floating bottom bar.

| Variant               | Shape                                                                    | Bet it is testing                                                                                                        |
| --------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **A — Session Queue** | Vertical dated agenda + unscheduled tray                                 | An AFK night is a _run order_, not a bucket. You prep by dragging into tonight, and you care about what stalls at 02:00. |
| **B — Timeline**      | Horizontal date axis, one bar per epic, milestone diamonds               | The primary question is _when does Z land_. Epics collapse to a bar, so 20 open epics is 20 rows, not 20 swimlanes.      |
| **C — Sprint Board**  | The existing kanban, scoped to one sprint, epics demoted to colour chips | Sprints are just a _filter_. Keep the board, cut what it shows. Cheapest possible fix for the navigation pain.           |

## Assumptions (stated, not verified)

- **Sprints are labels.** `sprint:<slug>` on an issue. Beads has no sprint field
  and this needs no schema change. The prototype reads such labels when present.
- **Assignment is in-memory.** When labels are absent (the normal case today),
  sessions are auto-bucketed from real issues by epic + priority so the screens
  are populated. Dragging re-assigns in memory only. **Reload wipes it.**
- **Read-only.** No `update-status` / label mutations are sent to bd. The
  question is what this should look like, not whether the backend works.

## Run it

```bash
npm run build && npm start
# then open the Roadmap ⚗ tab, or http://127.0.0.1:<port>/#/roadmap?variant=A
```

Or against the fake dataset, no bd required:

```bash
npm run build && node dev-fake-server.mjs
# http://127.0.0.1:4100/#/roadmap?variant=A
```

Cycle variants with the floating bottom bar or the `←` / `→` keys.

## Files

- `sprint-model.js` — in-memory sprint/session model + auto-bucketing.
- `variant-a-session-queue.js`, `variant-b-timeline.js`,
  `variant-c-sprint-board.js`
- `switcher.js` — floating variant bar (dev-only).
- `styles.js` — injected CSS, so `app/styles.css` stays untouched.
- `roadmap-prototype.js` — mounts the switcher + the active variant.

## Wiring into the app (revert these to drop the prototype)

- `app/router.js` — `parseView` recognises `#/roadmap`.
- `app/views/nav.js` — adds the `Roadmap ⚗` tab.
- `app/main.js` — `#roadmap-root` shell, view mount, and the roadmap view reuses
  the Board's `tab:board:*` subscriptions.

## Verdict

_(fill in once a variant wins — then fold the winner into real code and leave
the rest here)_
