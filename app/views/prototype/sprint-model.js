/**
 * PROTOTYPE — in-memory sprint/session model. Throwaway.
 *
 * Beads has no sprint field. The bet this encodes: a sprint is a label
 * (`sprint:<slug>`) plus a date, and an "AFK session" is a sprint one night
 * long. Nothing here is persisted — reassignments live in a Map and die on
 * reload. That is deliberate: the prototype is checking whether the *shape*
 * is right, not whether storage works.
 */
import { cmpPriorityThenCreated } from '../../data/sort.js';

/**
 * @typedef {{
 *   id: string,
 *   title?: string,
 *   status?: 'open'|'in_progress'|'closed',
 *   priority?: number,
 *   issue_type?: string,
 *   epic_id?: string | null,
 *   labels?: string[],
 *   created_at?: number,
 *   updated_at?: number,
 *   closed_at?: number
 * }} IssueLite
 */

/**
 * @typedef {{
 *   key: string,
 *   label: string,
 *   sub: string,
 *   date: Date | null,
 *   is_backlog: boolean
 * }} Session
 */

/**
 * @typedef {{
 *   issue: IssueLite,
 *   lane: 'blocked'|'ready'|'wip'|'closed',
 *   epic_id: string
 * }} Slot
 */

/** How many issues one overnight agent session is assumed to chew through. */
const SESSION_CAP = 6;

/** Nights on the horizon before everything else falls into the backlog. */
const NIGHT_COUNT = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
];

/**
 * @param {Date} d
 * @returns {string}
 */
export function formatDate(d) {
  return `${WEEKDAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/**
 * @param {Date} d
 * @returns {string}
 */
export function formatShort(d) {
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/**
 * Build the session horizon: tonight, tomorrow, three more nights, backlog.
 *
 * @param {Date} [today]
 * @returns {Session[]}
 */
export function buildSessions(today = new Date()) {
  const base = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
    0,
    0,
    0,
    0
  );
  /** @type {Session[]} */
  const sessions = [];
  for (let i = 0; i < NIGHT_COUNT; i++) {
    const date = new Date(base.getTime() + i * DAY_MS);
    /** @type {string} */
    let label;
    if (i === 0) {
      label = 'Tonight';
    } else if (i === 1) {
      label = 'Tomorrow night';
    } else {
      label = `${WEEKDAYS[date.getDay()]} night`;
    }
    sessions.push({
      key: `night-${i}`,
      label,
      sub: formatDate(date),
      date,
      is_backlog: false
    });
  }
  sessions.push({
    key: 'backlog',
    label: 'Unscheduled',
    sub: 'no session yet',
    date: null,
    is_backlog: true
  });
  return sessions;
}

/**
 * Read an explicit `sprint:<slug>` label off an issue, if the workspace
 * already uses that convention.
 *
 * @param {IssueLite} it
 * @returns {string}
 */
function labelSprint(it) {
  const labels = Array.isArray(it.labels) ? it.labels : [];
  for (const raw of labels) {
    const m = /^sprint[:/-](.+)$/i.exec(String(raw));
    if (m && m[1]) {
      return m[1].toLowerCase();
    }
  }
  return '';
}

/**
 * Create the prototype's sprint model over the four board lists.
 *
 * Auto-bucketing keeps an epic's work contiguous — an overnight agent run
 * that jumps between four epics is exactly the thing this is trying to avoid.
 *
 * @param {{ snapshotFor?: (client_id: string) => any[], subscribe?: (fn: () => void) => () => void }} issue_stores
 */
export function createSprintModel(issue_stores) {
  const sessions = buildSessions();
  /** Manual overrides from dragging. issue id → session key. @type {Map<string, string>} */
  const overrides = new Map();
  /** @type {Array<() => void>} */
  const listeners = [];

  function notify() {
    for (const fn of listeners) {
      try {
        fn();
      } catch {
        // prototype: swallow
      }
    }
  }

  /**
   * @param {string} client_id
   * @returns {IssueLite[]}
   */
  function snap(client_id) {
    if (!issue_stores || typeof issue_stores.snapshotFor !== 'function') {
      return [];
    }
    const arr = issue_stores.snapshotFor(client_id);
    return Array.isArray(arr) ? arr : [];
  }

  /**
   * Every non-closed issue, tagged with the board lane it came from.
   * `wip` wins over `ready`, `ready` wins over `blocked`, so an issue that
   * shows up in two lists is counted once.
   *
   * @returns {Slot[]}
   */
  function actionableSlots() {
    /** @type {Map<string, Slot>} */
    const by_id = new Map();
    /**
     * @param {IssueLite[]} items
     * @param {'blocked'|'ready'|'wip'} lane
     * @param {number} rank
     */
    function place(items, lane, rank) {
      for (const it of items) {
        if (!it || typeof it.id !== 'string' || it.issue_type === 'epic') {
          continue;
        }
        const prev = by_id.get(it.id);
        if (prev && LANE_RANK[prev.lane] >= rank) {
          continue;
        }
        by_id.set(it.id, {
          issue: it,
          lane,
          epic_id: typeof it.epic_id === 'string' ? it.epic_id : ''
        });
      }
    }
    place(snap('tab:board:blocked'), 'blocked', 1);
    place(snap('tab:board:ready'), 'ready', 2);
    place(snap('tab:board:in-progress'), 'wip', 3);
    return Array.from(by_id.values());
  }

  /** @type {Record<string, number>} */
  const LANE_RANK = { blocked: 1, ready: 2, wip: 3, closed: 0 };

  /**
   * Epic entities keyed by id (from the board's epics subscription).
   *
   * @returns {Map<string, IssueLite>}
   */
  function epicsById() {
    /** @type {Map<string, IssueLite>} */
    const m = new Map();
    for (const e of snap('tab:board:epics')) {
      if (e && typeof e.id === 'string') {
        m.set(e.id, e);
      }
    }
    return m;
  }

  /**
   * Auto-assign every actionable issue to a session, epic by epic.
   *
   * Order: epics that already have work in progress first, then by their
   * best (lowest) child priority. Within an epic: wip, then ready, then
   * blocked — a blocked issue at the front of a night is a stalled night.
   *
   * @param {Slot[]} slots
   * @returns {Map<string, string>} issue id → session key
   */
  function autoAssign(slots) {
    /** @type {Map<string, Slot[]>} */
    const by_epic = new Map();
    for (const slot of slots) {
      const list = by_epic.get(slot.epic_id) || [];
      list.push(slot);
      by_epic.set(slot.epic_id, list);
    }

    const groups = Array.from(by_epic.entries()).map(([epic_id, list]) => {
      const has_wip = list.some((s) => s.lane === 'wip');
      let best = 9;
      for (const s of list) {
        const p = Number(s.issue.priority);
        if (Number.isFinite(p) && p < best) {
          best = p;
        }
      }
      list.sort((a, b) => {
        const ra = LANE_RANK[b.lane] - LANE_RANK[a.lane];
        if (ra !== 0) {
          return ra;
        }
        return cmpPriorityThenCreated(a.issue, b.issue);
      });
      return { epic_id, list, has_wip, best };
    });

    groups.sort((a, b) => {
      if (a.has_wip !== b.has_wip) {
        return a.has_wip ? -1 : 1;
      }
      if (a.best !== b.best) {
        return a.best - b.best;
      }
      // Orphans ("no epic") sort last so real epics own the early nights.
      if (!a.epic_id !== !b.epic_id) {
        return a.epic_id ? -1 : 1;
      }
      return a.epic_id < b.epic_id ? -1 : 1;
    });

    /** @type {Map<string, string>} */
    const assignment = new Map();
    let night = 0;
    let used = 0;
    for (const group of groups) {
      // Start a fresh night when the current one cannot hold half this epic.
      if (used > 0 && used + Math.min(group.list.length, 3) > SESSION_CAP) {
        night += 1;
        used = 0;
      }
      for (const slot of group.list) {
        if (used >= SESSION_CAP) {
          night += 1;
          used = 0;
        }
        const key = night < NIGHT_COUNT ? `night-${night}` : 'backlog';
        assignment.set(slot.issue.id, key);
        if (night < NIGHT_COUNT) {
          used += 1;
        }
      }
    }
    return assignment;
  }

  /**
   * The full derived plan: sessions with their ordered issues, plus per-epic
   * rollups and a projected landing date.
   *
   * @returns {{
   *   sessions: Array<Session & { slots: Slot[] }>,
   *   epics: Array<{
   *     id: string,
   *     epic: IssueLite | null,
   *     title: string,
   *     slots: Slot[],
   *     closed: number,
   *     total: number,
   *     first_session: string,
   *     last_session: string,
   *     lands: Date | null,
   *     unscheduled: boolean
   *   }>,
   *   unassigned_count: number,
   *   uses_labels: boolean
   * }}
   */
  function plan() {
    const slots = actionableSlots();
    const auto = autoAssign(slots);
    const epic_map = epicsById();
    let uses_labels = false;

    /** @type {Map<string, Array<Session & { slots: Slot[] }>[number]>} */
    const session_map = new Map();
    /** @type {Array<Session & { slots: Slot[] }>} */
    const out_sessions = sessions.map((s) => {
      const entry = { ...s, slots: /** @type {Slot[]} */ ([]) };
      session_map.set(s.key, entry);
      return entry;
    });

    for (const slot of slots) {
      const id = slot.issue.id;
      const from_label = labelSprint(slot.issue);
      if (from_label) {
        uses_labels = true;
      }
      const key =
        overrides.get(id) ||
        (from_label && session_map.has(from_label) ? from_label : '') ||
        auto.get(id) ||
        'backlog';
      const bucket = session_map.get(key) || session_map.get('backlog');
      if (bucket) {
        bucket.slots.push(slot);
      }
    }

    // Keep a stable, readable run order inside each night.
    for (const s of out_sessions) {
      s.slots.sort((a, b) => {
        if (a.epic_id !== b.epic_id) {
          return a.epic_id < b.epic_id ? -1 : 1;
        }
        const ra = LANE_RANK[b.lane] - LANE_RANK[a.lane];
        if (ra !== 0) {
          return ra;
        }
        return cmpPriorityThenCreated(a.issue, b.issue);
      });
    }

    /** @type {Map<string, number>} */
    const session_index = new Map();
    out_sessions.forEach((s, i) => session_index.set(s.key, i));

    /** @type {Map<string, number>} */
    const closed_by_epic = new Map();
    for (const it of snap('tab:board:closed')) {
      if (!it || it.issue_type === 'epic') {
        continue;
      }
      const eid = typeof it.epic_id === 'string' ? it.epic_id : '';
      closed_by_epic.set(eid, (closed_by_epic.get(eid) || 0) + 1);
    }

    /** @type {Map<string, Slot[]>} */
    const slots_by_epic = new Map();
    for (const slot of slots) {
      const list = slots_by_epic.get(slot.epic_id) || [];
      list.push(slot);
      slots_by_epic.set(slot.epic_id, list);
    }

    /** @type {Map<string, string>} issue id → session key */
    const resolved = new Map();
    for (const s of out_sessions) {
      for (const slot of s.slots) {
        resolved.set(slot.issue.id, s.key);
      }
    }

    const epic_ids = new Set([
      ...slots_by_epic.keys(),
      ...closed_by_epic.keys()
    ]);
    const epics = Array.from(epic_ids).map((id) => {
      const epic_slots = slots_by_epic.get(id) || [];
      const closed = closed_by_epic.get(id) || 0;
      let first = Infinity;
      let last = -1;
      let unscheduled = epic_slots.length === 0;
      for (const slot of epic_slots) {
        const key = resolved.get(slot.issue.id) || 'backlog';
        const idx = session_index.get(key);
        if (idx === undefined) {
          continue;
        }
        if (key === 'backlog') {
          unscheduled = true;
        }
        first = Math.min(first, idx);
        last = Math.max(last, idx);
      }
      const first_session = out_sessions[first === Infinity ? 0 : first];
      const last_session = out_sessions[last < 0 ? 0 : last];
      const epic = epic_map.get(id) || null;
      return {
        id,
        epic,
        title: id ? epic?.title || '(untitled epic)' : 'No epic · orphans',
        slots: epic_slots,
        closed,
        total: epic_slots.length + closed,
        first_session: first_session.key,
        last_session: last_session.key,
        lands: unscheduled ? null : last_session.date,
        unscheduled
      };
    });

    epics.sort((a, b) => {
      const ia = session_index.get(a.first_session) ?? 99;
      const ib = session_index.get(b.first_session) ?? 99;
      if (ia !== ib) {
        return ia - ib;
      }
      return a.title.toLowerCase() < b.title.toLowerCase() ? -1 : 1;
    });

    const backlog = session_map.get('backlog');
    return {
      sessions: out_sessions,
      epics,
      unassigned_count: backlog ? backlog.slots.length : 0,
      uses_labels
    };
  }

  return {
    sessions,
    plan,
    /**
     * Move an issue into a session. In-memory only.
     *
     * @param {string} issue_id
     * @param {string} session_key
     */
    assign(issue_id, session_key) {
      overrides.set(issue_id, session_key);
      notify();
    },
    /** Forget every manual move and fall back to auto-bucketing. */
    reset() {
      overrides.clear();
      notify();
    },
    hasOverrides() {
      return overrides.size > 0;
    },
    /**
     * @param {() => void} fn
     */
    subscribe(fn) {
      listeners.push(fn);
      if (issue_stores && typeof issue_stores.subscribe === 'function') {
        issue_stores.subscribe(fn);
      }
      return () => {
        const i = listeners.indexOf(fn);
        if (i >= 0) {
          listeners.splice(i, 1);
        }
      };
    }
  };
}
