/**
 * Session maps — the tracking bead a prep agent publishes before an unattended
 * ("AFK") agent session, and closes out afterwards.
 *
 * The map is input, not something this UI plans: the agent decides the queue
 * order, which chains open mid-session, the single label that gates human
 * decisions, what is deliberately out of scope, and the traps the next agent
 * must not rediscover. This module turns that document into data, says what is
 * wrong with it, and overlays what the workspace reports right now.
 *
 * The document format is `SESSION MAP v1`. It is owned by the `afk-session-map`
 * skill (`FORMAT.md`), not by this repo — this module is a reader of it, so
 * treat the skill as the source of truth when the two disagree.
 *
 * Shape, in brief:
 * - line 1 is exactly `SESSION MAP v1`;
 * - then `KEY: value` header lines (`DATE`, `GATE`, `QUERY` required;
 *   `MACHINE`, `RUNWAY`, `SUPERSEDES` optional);
 * - then sections, each introduced by a heading alone on a line drawn from a
 *   closed vocabulary: `SINCE`, `QUEUE`, `OVERFLOW`, `CHAINS`, `DECISIONS`,
 *   `OUT OF SCOPE`, `TRAPS`, `QUALITY GATE`, `ON FAILURE`;
 * - rows start at column 0, continuation lines are indented two spaces, and
 *   anything else between rows is commentary the reader ignores.
 *
 * The post-run report is a separate `OUTCOME v1` document in the bead's notes.
 */

/**
 * @typedef {{
 *   id: string,
 *   title?: string,
 *   status?: string,
 *   issue_type?: string,
 *   labels?: string[],
 *   description?: string,
 *   notes?: string,
 *   acceptance?: string,
 *   acceptance_criteria?: string
 * }} IssueLike
 */

/**
 * @typedef {'closed'|'wip'|'ready'|'blocked'|'unknown'} LiveState
 */

/**
 * One row of `QUEUE` or `OVERFLOW`. `brief` is the indented "why this, why
 * here" the agent wrote under the row; `live` is filled in by {@link overlay}.
 *
 * @typedef {{
 *   n: number,
 *   id: string,
 *   priority: number,
 *   title: string,
 *   brief: string,
 *   live: LiveState
 * }} QueueItem
 */

/**
 * A `DECISIONS` or `OUT OF SCOPE` row: an issue id plus its prose.
 *
 * @typedef {{ id: string, text: string }} Entry
 */

/**
 * @typedef {{ n: number, title: string, body: string, affects: string[] }} Trap
 */

/**
 * @typedef {{
 *   closed: string,
 *   commits: string,
 *   suite: string,
 *   opened: string[],
 *   followups: Array<{ id: string, priority: number, text: string }>
 * }} Outcome
 */

/**
 * @typedef {{ level: 'error'|'warn', message: string }} Problem
 */

/**
 * @typedef {{
 *   id: string,
 *   title: string,
 *   version: number,
 *   date: string,
 *   gate: string,
 *   query: string,
 *   machine: string,
 *   runway: string,
 *   supersedes: string,
 *   status: 'closed'|'open',
 *   since: string,
 *   queue: QueueItem[],
 *   overflow: QueueItem[],
 *   on_failure: string,
 *   chains: string[][],
 *   decisions: Entry[],
 *   out_of_scope: Entry[],
 *   traps: Trap[],
 *   quality_gate: { cmd: string, expect: string, text: string },
 *   outcome: Outcome | null,
 *   acceptance: string,
 *   problems: Problem[]
 * }} SessionMap
 */

/** The label a prep agent puts on a map bead. */
export const MAP_LABEL = 'session-map';

/** Line 1 of a map description. The only version this reader accepts. */
export const MAP_MARKER_RE = /^SESSION MAP v(\d+)$/;

/** Section headings, as a closed vocabulary. Anything else is commentary. */
const SECTIONS = new Set([
  'SINCE',
  'QUEUE',
  'OVERFLOW',
  'ON FAILURE',
  'CHAINS',
  'DECISIONS',
  'OUT OF SCOPE',
  'TRAPS',
  'QUALITY GATE',
  'FOLLOW-UPS'
]);

/**
 * Does this issue claim to be a session map? Label first, then the marker, so
 * a bead that carries the document but lost its label is still found.
 *
 * A bead that claims to be a map but is not v1 still matches here on purpose:
 * {@link parseMap} reports that as an error rather than silently dropping it.
 *
 * @param {IssueLike | null | undefined} issue
 * @returns {boolean}
 */
export function isSessionMapIssue(issue) {
  if (!issue) {
    return false;
  }
  const labels = Array.isArray(issue.labels) ? issue.labels : [];
  if (labels.includes(MAP_LABEL)) {
    return true;
  }
  return /^\s*SESSION MAP v\d/.test(String(issue.description || ''));
}

/**
 * Split into lines and strip the common indent. `bd show` indents the whole
 * description; a raw description does not. Removing the shared prefix makes
 * the "rows at column 0, continuations indented" rule hold for both.
 *
 * @param {string} text
 * @returns {string[]}
 */
function dedentLines(text) {
  const lines = String(text || '')
    .replace(/\r\n/g, '\n')
    .split('\n');
  let min = Infinity;
  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    const m = /^[ \t]*/.exec(line);
    min = Math.min(min, m ? m[0].length : 0);
  }
  if (!Number.isFinite(min) || min === 0) {
    return lines;
  }
  return lines.map((l) => (l.trim() ? l.slice(min) : l));
}

/**
 * @returns {SessionMap}
 */
function emptyMap() {
  return {
    id: '',
    title: '',
    version: 0,
    date: '',
    gate: '',
    query: '',
    machine: '',
    runway: '',
    supersedes: '',
    status: 'open',
    since: '',
    queue: [],
    overflow: [],
    on_failure: '',
    chains: [],
    decisions: [],
    out_of_scope: [],
    traps: [],
    quality_gate: { cmd: '', expect: '', text: '' },
    outcome: null,
    acceptance: '',
    problems: []
  };
}

/**
 * Parse the body of a v1 description.
 *
 * @param {string[]} lines - Already dedented.
 * @returns {SessionMap}
 */
function parseV1(lines) {
  const map = emptyMap();
  map.version = 1;

  /** Current section, or `HEADER` before the first heading. @type {string} */
  let section = 'HEADER';
  /**
   * The row an indented line continues: a queue row's brief, a decision's
   * text, or a trap's body. Cleared by a blank line or a new row.
   *
   * @type {QueueItem | Entry | Trap | null}
   */
  let continuable = null;

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    const trimmed = line.trim();
    if (!trimmed) {
      continuable = null;
      continue;
    }

    if (SECTIONS.has(trimmed)) {
      section = trimmed;
      continuable = null;
      continue;
    }

    if (/^\s{2,}\S/.test(line) && continuable) {
      appendContinuation(continuable, trimmed);
      continue;
    }

    if (section === 'HEADER') {
      readHeaderLine(map, trimmed);
      continue;
    }

    if (section === 'QUEUE' || section === 'OVERFLOW') {
      const m = /^(\d+)\.\s+(\S+)\s+P([0-4])\s+(.+)$/.exec(trimmed);
      if (m) {
        /** @type {QueueItem} */
        const item = {
          n: Number(m[1]),
          id: m[2],
          priority: Number(m[3]),
          title: m[4].trim(),
          brief: '',
          live: 'unknown'
        };
        (section === 'QUEUE' ? map.queue : map.overflow).push(item);
        continuable = item;
      }
      continue;
    }

    if (section === 'SINCE') {
      map.since = `${map.since} ${trimmed}`.trim();
      continue;
    }

    if (section === 'ON FAILURE') {
      map.on_failure = `${map.on_failure} ${trimmed}`.trim();
      continue;
    }

    if (section === 'CHAINS') {
      const chain = parseChain(trimmed);
      if (chain) {
        map.chains.push(chain);
      }
      continue;
    }

    if (section === 'DECISIONS' || section === 'OUT OF SCOPE') {
      const m = /^(\S+)\s+(.+)$/.exec(trimmed);
      if (m) {
        /** @type {Entry} */
        const entry = { id: m[1], text: m[2].trim() };
        (section === 'DECISIONS' ? map.decisions : map.out_of_scope).push(
          entry
        );
        continuable = entry;
      }
      continue;
    }

    if (section === 'TRAPS') {
      continuable = readTrapLine(map, trimmed);
      continue;
    }

    if (section === 'QUALITY GATE') {
      readQualityGateLine(map, trimmed);
    }
  }

  return map;
}

/**
 * @param {QueueItem | Entry | Trap} target
 * @param {string} trimmed
 */
function appendContinuation(target, trimmed) {
  if ('brief' in target) {
    target.brief = collapse(`${target.brief} ${trimmed}`);
  } else if ('text' in target) {
    target.text = collapse(`${target.text} ${trimmed}`);
  } else {
    target.body = collapse(`${target.body} ${trimmed}`);
  }
}

/**
 * @param {string} text
 * @returns {string}
 */
function collapse(text) {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * @param {SessionMap} map
 * @param {string} trimmed
 */
function readHeaderLine(map, trimmed) {
  const m = /^([A-Z][A-Z _-]*):\s*(.*)$/.exec(trimmed);
  if (!m) {
    return;
  }
  const value = m[2].trim();
  switch (m[1].trim()) {
    case 'DATE':
      map.date = value;
      break;
    case 'GATE':
      map.gate = value;
      break;
    case 'QUERY':
      map.query = value;
      break;
    case 'MACHINE':
      map.machine = value;
      break;
    case 'RUNWAY':
      map.runway = value;
      break;
    case 'SUPERSEDES':
      map.supersedes = value;
      break;
    default:
      break;
  }
}

/**
 * `a -> b -> c`, ids only. A line that is not a chain is commentary.
 *
 * @param {string} trimmed
 * @returns {string[] | null}
 */
function parseChain(trimmed) {
  if (!trimmed.includes('->')) {
    return null;
  }
  const parts = trimmed
    .split('->')
    .map((s) => s.trim())
    .filter((s) => /^[\w.-]+$/.test(s));
  return parts.length >= 2 ? parts : null;
}

/**
 * A trap row (`1. SHOUTED TITLE. body`) or the `AFFECTS:` line that pins the
 * preceding trap to the queue rows it endangers.
 *
 * @param {SessionMap} map
 * @param {string} trimmed
 * @returns {Trap | null} The row a following indented line continues.
 */
function readTrapLine(map, trimmed) {
  const affects = /^AFFECTS:\s*(.+)$/.exec(trimmed);
  if (affects && map.traps.length) {
    map.traps[map.traps.length - 1].affects = affects[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return null;
  }
  const m = /^(\d+)\.\s+([A-Z][A-Z0-9 ._-]{2,})\.\s*(.*)$/.exec(trimmed);
  if (!m) {
    return null;
  }
  /** @type {Trap} */
  const trap = {
    n: Number(m[1]),
    title: m[2].trim(),
    body: m[3].trim(),
    affects: []
  };
  map.traps.push(trap);
  return trap;
}

/**
 * @param {SessionMap} map
 * @param {string} trimmed
 */
function readQualityGateLine(map, trimmed) {
  const cmd = /^CMD:\s*(.+)$/.exec(trimmed);
  if (cmd) {
    map.quality_gate.cmd = cmd[1].trim();
    return;
  }
  const expect = /^EXPECT:\s*(.+)$/.exec(trimmed);
  if (expect) {
    map.quality_gate.expect = expect[1].trim();
    return;
  }
  map.quality_gate.text = `${map.quality_gate.text} ${trimmed}`.trim();
}

/**
 * Parse the `OUTCOME v1` block a closing agent writes into the bead's notes.
 * Notes that are not an outcome document return `null`.
 *
 * @param {string} notes
 * @returns {Outcome | null}
 */
export function parseOutcome(notes) {
  const lines = dedentLines(notes);
  const first = lines.find((l) => l.trim());
  if (!first || first.trim() !== 'OUTCOME v1') {
    return null;
  }
  /** @type {Outcome} */
  const out = { closed: '', commits: '', suite: '', opened: [], followups: [] };
  let section = 'HEADER';
  /** @type {{ text: string } | null} */
  let continuable = null;

  for (const raw of lines.slice(1)) {
    const line = raw.replace(/\s+$/, '');
    const trimmed = line.trim();
    if (!trimmed) {
      continuable = null;
      continue;
    }
    if (SECTIONS.has(trimmed)) {
      section = trimmed;
      continuable = null;
      continue;
    }
    if (/^\s{2,}\S/.test(line) && continuable) {
      continuable.text = collapse(`${continuable.text} ${trimmed}`);
      continue;
    }
    if (section === 'HEADER') {
      const m = /^([A-Z][A-Z _-]*):\s*(.*)$/.exec(trimmed);
      if (!m) {
        continue;
      }
      const value = m[2].trim();
      switch (m[1].trim()) {
        case 'CLOSED':
          out.closed = value;
          break;
        case 'COMMITS':
          out.commits = value;
          break;
        case 'SUITE':
          out.suite = value;
          break;
        case 'OPENED':
          out.opened = value
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          break;
        default:
          break;
      }
      continue;
    }
    if (section === 'FOLLOW-UPS') {
      const m = /^(\S+)\s+P([0-4])\s+(.+)$/.exec(trimmed);
      if (m) {
        const entry = {
          id: m[1],
          priority: Number(m[2]),
          text: m[3].trim()
        };
        out.followups.push(entry);
        continuable = entry;
      }
    }
  }
  return out;
}

/**
 * Parse a map bead. Always returns a map: a description that is not a v1
 * document comes back empty, with the reason in `problems`, because a bead
 * labelled `session-map` that cannot be read is a thing the reader should
 * show rather than skip.
 *
 * @param {IssueLike | null | undefined} issue
 * @returns {SessionMap}
 */
export function parseMap(issue) {
  const lines = dedentLines(String(issue?.description || ''));
  const first = (lines.find((l) => l.trim()) || '').trim();
  const version = MAP_MARKER_RE.exec(first);

  const map = version && version[1] === '1' ? parseV1(lines) : emptyMap();
  map.id = String(issue?.id || '');
  map.title = String(issue?.title || '');
  map.status = issue?.status === 'closed' ? 'closed' : 'open';
  // `bd` reports acceptance criteria under either name, as detail does.
  map.acceptance = String(
    issue?.acceptance || issue?.acceptance_criteria || ''
  );
  map.outcome = parseOutcome(String(issue?.notes || ''));
  if (!map.date) {
    const d = /(\d{4}-\d{2}-\d{2})/.exec(map.title);
    map.date = d ? d[1] : '';
  }
  if (version && version[1] !== '1') {
    map.problems.push({
      level: 'error',
      message: `Session map v${version[1]} is newer than this reader, which understands v1 only.`
    });
    return map;
  }
  map.problems.push(...validateMap(map));
  return map;
}

/**
 * What is wrong with this map, in the format's own terms. Errors are things a
 * reader cannot work around; warnings are things that will bite the session or
 * the next prep pass.
 *
 * @param {SessionMap} map
 * @returns {Problem[]}
 */
export function validateMap(map) {
  /** @type {Problem[]} */
  const problems = [];
  /** @param {string} message */
  const err = (message) => problems.push({ level: 'error', message });
  /** @param {string} message */
  const warn = (message) => problems.push({ level: 'warn', message });

  if (map.version !== 1) {
    err('No `SESSION MAP v1` marker on line 1 — nothing was read.');
    return problems;
  }
  if (!map.date) {
    err('Missing DATE.');
  }
  if (!map.gate) {
    err('Missing GATE.');
  } else if (/[ ,]/.test(map.gate.trim())) {
    // Two filters that must agree stop agreeing silently. The format keeps
    // the gate to one label for exactly that reason.
    err(`GATE must be a single label, got "${map.gate}".`);
  }
  if (!map.query) {
    warn('Missing QUERY — drift cannot be rechecked against the same filter.');
  }
  if (map.queue.length === 0) {
    err('QUEUE is empty.');
  }

  /** @type {Set<string>} */
  const queued = new Set();
  map.queue.forEach((q, i) => {
    if (q.n !== i + 1) {
      err(`QUEUE position ${q.n} is out of sequence (expected ${i + 1}).`);
    }
    if (queued.has(q.id)) {
      err(`QUEUE lists ${q.id} twice.`);
    }
    queued.add(q.id);
  });
  map.overflow.forEach((q, i) => {
    if (q.n !== i + 1) {
      err(`OVERFLOW position ${q.n} is out of sequence (expected ${i + 1}).`);
    }
    if (queued.has(q.id)) {
      err(`${q.id} is in both QUEUE and OVERFLOW.`);
    }
  });

  // Briefs and ON FAILURE cannot be retro-fitted to a finished session, so
  // only a map that is still the current plan is held to them.
  const open = map.status === 'open';
  const briefless = map.queue.filter((q) => !q.brief).length;
  if (open && briefless) {
    warn(
      `${briefless} QUEUE row${briefless === 1 ? ' has' : 's have'} no brief — ordering alone is not a brief.`
    );
  }
  if (open && !map.on_failure) {
    warn('No ON FAILURE — a red gate at 03:00 has no written answer.');
  }

  for (const chain of map.chains) {
    if (!queued.has(chain[0])) {
      warn(`Chain head ${chain[0]} is not in QUEUE, so it cannot open.`);
    }
  }
  for (const entry of map.out_of_scope) {
    if (!entry.text) {
      warn(`OUT OF SCOPE ${entry.id} gives no reason.`);
    }
  }
  const pinnable = new Set([...queued, ...map.overflow.map((q) => q.id)]);
  for (const trap of map.traps) {
    for (const id of trap.affects) {
      if (!pinnable.has(id)) {
        warn(
          `Trap "${trap.title}" affects ${id}, which is in neither QUEUE nor OVERFLOW.`
        );
      }
    }
  }
  return problems;
}

/**
 * @typedef {{
 *   ready: IssueLike[],
 *   wip: IssueLike[],
 *   blocked: IssueLike[],
 *   closed: IssueLike[]
 * }} LiveLists
 */

/**
 * @typedef {{
 *   map: SessionMap,
 *   done: number,
 *   running: number,
 *   remaining: number,
 *   next: QueueItem | null,
 *   opened_chains: string[][],
 *   traps_by_id: Map<string, Trap[]>,
 *   missing_from_live: QueueItem[],
 *   ready_not_in_map: IssueLike[],
 *   matched: boolean,
 *   drift_applies: boolean
 * }} MapOverlay
 */

/**
 * Overlay what the workspace reports now onto the map the agent wrote: per-row
 * status, which chains have been released, and the drift between the map and
 * what the map's own `QUERY` would return today.
 *
 * Drift is only meaningful while the map is still the plan. A closed session
 * compared against today's ready list is noise, and a map whose ids belong to
 * another workspace matches nothing, so both are reported as "not applicable"
 * rather than as disagreement.
 *
 * @param {SessionMap} map
 * @param {LiveLists} live
 * @returns {MapOverlay}
 */
export function overlay(map, live) {
  /** @param {IssueLike[] | undefined} arr */
  const idsOf = (arr) =>
    new Set(
      (Array.isArray(arr) ? arr : [])
        .map((it) => String(it?.id || ''))
        .filter(Boolean)
    );
  const closed = idsOf(live?.closed);
  const wip = idsOf(live?.wip);
  const blocked = idsOf(live?.blocked);
  const ready = idsOf(live?.ready);
  const known = new Set([...closed, ...wip, ...blocked, ...ready]);

  let matched = false;
  const queue = map.queue.map((item) => {
    if (!known.has(item.id)) {
      return { ...item };
    }
    matched = true;
    /** @type {LiveState} */
    const state = closed.has(item.id)
      ? 'closed'
      : wip.has(item.id)
        ? 'wip'
        : blocked.has(item.id)
          ? 'blocked'
          : 'ready';
    return { ...item, live: state };
  });

  const done = queue.filter((q) => q.live === 'closed').length;
  const running = queue.filter((q) => q.live === 'wip').length;
  const next =
    queue.find((q) => q.live === 'wip' || q.live === 'ready') || null;
  const opened_chains = map.chains.filter((chain) => {
    const head = queue.find((q) => q.id === chain[0]);
    return head ? head.live === 'closed' : false;
  });

  /** Traps pinned to the row they endanger. @type {Map<string, Trap[]>} */
  const traps_by_id = new Map();
  for (const trap of map.traps) {
    for (const id of trap.affects) {
      const list = traps_by_id.get(id) || [];
      list.push(trap);
      traps_by_id.set(id, list);
    }
  }

  const drift_applies = matched && map.status === 'open';
  const in_map = new Set(queue.map((q) => q.id));
  const out_of_scope = new Set(map.out_of_scope.map((e) => e.id));
  const gate = map.gate || 'human';

  return {
    map: { ...map, queue },
    done,
    running,
    remaining: queue.length - done,
    next,
    opened_chains,
    traps_by_id,
    missing_from_live: drift_applies
      ? queue.filter((q) => !known.has(q.id))
      : [],
    // Drift: ready, ungated, not deliberately out of scope, not in the map.
    ready_not_in_map: drift_applies
      ? (live.ready || []).filter((it) => {
          const id = String(it?.id || '');
          const labels = Array.isArray(it?.labels) ? it.labels : [];
          return (
            id &&
            it.issue_type !== 'epic' &&
            !in_map.has(id) &&
            !out_of_scope.has(id) &&
            !labels.includes(gate)
          );
        })
      : [],
    matched,
    drift_applies
  };
}
