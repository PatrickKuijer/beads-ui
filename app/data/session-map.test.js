import { describe, expect, test } from 'vitest';
import {
  isSessionMapIssue,
  overlay,
  parseMap,
  parseOutcome,
  validateMap
} from './session-map.js';

const DESCRIPTION = `SESSION MAP v1
DATE: 2026-08-05
GATE: human
QUERY: bd ready --exclude-label human --exclude-type epic
MACHINE: vlab
RUNWAY: 3 ready now
SUPERSEDES: acme-old

TRACKING BEAD, not slice work — do not work this bead.

SINCE
The three decisions on the previous map were answered.
Two follow-ups are queued here.

QUEUE
1. acme-aaa   P2  First thing
  First because it heads the longest chain.
  Scope stops at the loader.
2. acme-bbb   P3  Second thing
  Independent of the rest.
3. acme-ccc   P4  Third thing
  Blocked until aaa lands.

OVERFLOW
1. acme-ddd   P4  Filler
  Safe if the queue drains.

CHAINS
acme-aaa -> acme-eee -> acme-fff
acme-bbb -> acme-ggg

DECISIONS
acme-hhh  Which of (a) or (b) for the clock. Gates the pilot call sites.
acme-iii  Scope call on the shim.

OUT OF SCOPE
acme-jjj  Needs a desktop session; the tree does not exist on vlab.

TRAPS
1. MACHINE SCOPE. The prep pass ran on vlab, where the tree is absent.
   Their absence from bd ready is correct.
2. SOFT ACCEPTANCE CRITERION. The test already asserts half of it.
AFFECTS: acme-ccc

QUALITY GATE
CMD: npm run all
EXPECT: green

ON FAILURE
One fix attempt, then restore the tree to green and move on.
`;

const NOTES = `OUTCOME v1
CLOSED: 3/3
COMMITS: 2ea9641..5875753
SUITE: 1651 green
OPENED: acme-eee, acme-ggg

FOLLOW-UPS
acme-kkk  P2  The oracle reports displaced members as disagreements when
  the description leaves a hole.
acme-lll  P4  Spelling in the run report.
`;

/**
 * @param {Partial<import('./session-map.js').IssueLike>} [patch]
 */
function mapIssue(patch = {}) {
  return {
    id: 'acme-map',
    title: 'AFK session map: 2026-08-05',
    status: 'open',
    labels: ['session-map'],
    description: DESCRIPTION,
    ...patch
  };
}

/** @param {string[]} ids */
function items(ids) {
  return ids.map((id) => ({ id, issue_type: 'task', labels: [] }));
}

describe('data/session-map parseMap', () => {
  test('reads the v1 header', () => {
    const map = parseMap(mapIssue());
    expect(map.version).toBe(1);
    expect(map.date).toBe('2026-08-05');
    expect(map.gate).toBe('human');
    expect(map.query).toBe(
      'bd ready --exclude-label human --exclude-type epic'
    );
    expect(map.machine).toBe('vlab');
    expect(map.runway).toBe('3 ready now');
    expect(map.supersedes).toBe('acme-old');
    expect(map.id).toBe('acme-map');
    expect(map.status).toBe('open');
  });

  test('reads queue rows with their briefs', () => {
    const { queue } = parseMap(mapIssue());
    expect(queue.map((q) => q.id)).toEqual([
      'acme-aaa',
      'acme-bbb',
      'acme-ccc'
    ]);
    expect(queue[0]).toMatchObject({
      n: 1,
      priority: 2,
      title: 'First thing',
      live: 'unknown'
    });
    // Continuation lines join into one brief.
    expect(queue[0].brief).toBe(
      'First because it heads the longest chain. Scope stops at the loader.'
    );
  });

  test('reads overflow separately from the queue', () => {
    const map = parseMap(mapIssue());
    expect(map.overflow).toHaveLength(1);
    expect(map.overflow[0].id).toBe('acme-ddd');
    expect(map.overflow[0].brief).toBe('Safe if the queue drains.');
  });

  test('reads chains, decisions, out of scope and prose sections', () => {
    const map = parseMap(mapIssue());
    expect(map.chains).toEqual([
      ['acme-aaa', 'acme-eee', 'acme-fff'],
      ['acme-bbb', 'acme-ggg']
    ]);
    expect(map.decisions.map((d) => d.id)).toEqual(['acme-hhh', 'acme-iii']);
    expect(map.decisions[0].text).toMatch(/Which of \(a\) or \(b\)/);
    expect(map.out_of_scope).toHaveLength(1);
    expect(map.out_of_scope[0].id).toBe('acme-jjj');
    expect(map.since).toMatch(/^The three decisions/);
    expect(map.on_failure).toMatch(/One fix attempt/);
    expect(map.quality_gate).toEqual({
      cmd: 'npm run all',
      expect: 'green',
      text: ''
    });
  });

  test('pins a trap to the rows named by AFFECTS', () => {
    const { traps } = parseMap(mapIssue());
    expect(traps.map((t) => t.title)).toEqual([
      'MACHINE SCOPE',
      'SOFT ACCEPTANCE CRITERION'
    ]);
    expect(traps[0].body).toBe(
      'The prep pass ran on vlab, where the tree is absent. Their absence from bd ready is correct.'
    );
    expect(traps[0].affects).toEqual([]);
    expect(traps[1].affects).toEqual(['acme-ccc']);
  });

  test('ignores commentary between rows', () => {
    const map = parseMap(mapIssue());
    // The "TRACKING BEAD" paragraph is not a header key, a section or a row.
    expect(map.queue).toHaveLength(3);
    expect(map.problems.filter((p) => p.level === 'error')).toEqual([]);
  });

  test('parses a `bd show`-indented description identically', () => {
    const indented = DESCRIPTION.split('\n')
      .map((l) => (l ? `  ${l}` : l))
      .join('\n');
    expect(parseMap(mapIssue({ description: indented }))).toEqual(
      parseMap(mapIssue())
    );
  });

  test('takes the date from the title when the header omits it', () => {
    const description = DESCRIPTION.replace('DATE: 2026-08-05\n', '');
    const map = parseMap(
      mapIssue({ description, title: 'AFK session map: 2026-07-04 queue' })
    );
    expect(map.date).toBe('2026-07-04');
  });

  test('reports a missing marker instead of guessing', () => {
    const map = parseMap(mapIssue({ description: 'QUEUE\n1. acme-aaa P2 x' }));
    expect(map.version).toBe(0);
    expect(map.queue).toEqual([]);
    expect(map.problems).toEqual([
      {
        level: 'error',
        message: 'No `SESSION MAP v1` marker on line 1 — nothing was read.'
      }
    ]);
  });

  test('refuses a version it does not understand', () => {
    const map = parseMap(
      mapIssue({ description: DESCRIPTION.replace('v1', 'v2') })
    );
    expect(map.queue).toEqual([]);
    expect(map.problems[0].message).toMatch(/v2 is newer than this reader/);
  });

  test('survives missing and malformed input', () => {
    expect(parseMap(undefined).problems).toHaveLength(1);
    expect(parseMap({ id: 'x' }).queue).toEqual([]);
    expect(parseMap({ id: 'x', description: 'SESSION MAP v1' }).version).toBe(
      1
    );
  });

  test('reads the outcome from the notes', () => {
    const map = parseMap(mapIssue({ status: 'closed', notes: NOTES }));
    expect(map.status).toBe('closed');
    expect(map.outcome).not.toBeNull();
    expect(map.outcome?.closed).toBe('3/3');
    expect(map.outcome?.opened).toEqual(['acme-eee', 'acme-ggg']);
  });

  test('prefers acceptance, falling back to acceptance_criteria', () => {
    expect(parseMap(mapIssue({ acceptance: 'a' })).acceptance).toBe('a');
    expect(parseMap(mapIssue({ acceptance_criteria: 'b' })).acceptance).toBe(
      'b'
    );
  });
});

describe('data/session-map parseOutcome', () => {
  test('reads the header and the follow-ups', () => {
    const out = parseOutcome(NOTES);
    expect(out).not.toBeNull();
    expect(out?.commits).toBe('2ea9641..5875753');
    expect(out?.suite).toBe('1651 green');
    expect(out?.followups).toHaveLength(2);
    expect(out?.followups[0]).toMatchObject({ id: 'acme-kkk', priority: 2 });
    expect(out?.followups[0].text).toBe(
      'The oracle reports displaced members as disagreements when the description leaves a hole.'
    );
  });

  test('returns null for notes that are not an outcome', () => {
    expect(parseOutcome('')).toBeNull();
    expect(parseOutcome('Ran out of time, see the bead.')).toBeNull();
  });
});

describe('data/session-map validateMap', () => {
  /** @param {string} description */
  const problemsOf = (description) =>
    parseMap(mapIssue({ description })).problems.map((p) => p.message);

  test('accepts a conforming map', () => {
    expect(parseMap(mapIssue()).problems).toEqual([]);
  });

  test('catches a queue that is out of sequence or repeats an id', () => {
    const messages = problemsOf(
      DESCRIPTION.replace('2. acme-bbb', '3. acme-bbb').replace(
        '3. acme-ccc   P4  Third thing',
        '3. acme-aaa   P4  Third thing'
      )
    );
    expect(messages).toContain(
      'QUEUE position 3 is out of sequence (expected 2).'
    );
    expect(messages).toContain('QUEUE lists acme-aaa twice.');
  });

  test('catches an id in both QUEUE and OVERFLOW', () => {
    expect(
      problemsOf(DESCRIPTION.replace('1. acme-ddd', '1. acme-aaa'))
    ).toContain('acme-aaa is in both QUEUE and OVERFLOW.');
  });

  test('insists the gate is a single label', () => {
    expect(
      problemsOf(DESCRIPTION.replace('GATE: human', 'GATE: human, blocked'))
    ).toContain('GATE must be a single label, got "human, blocked".');
  });

  test('flags a chain that cannot open and a trap pinned to nothing', () => {
    const messages = problemsOf(
      DESCRIPTION.replace(
        'acme-bbb -> acme-ggg',
        'acme-zzz -> acme-ggg'
      ).replace('AFFECTS: acme-ccc', 'AFFECTS: acme-yyy')
    );
    expect(messages).toContain(
      'Chain head acme-zzz is not in QUEUE, so it cannot open.'
    );
    expect(messages).toContain(
      'Trap "SOFT ACCEPTANCE CRITERION" affects acme-yyy, which is in neither QUEUE nor OVERFLOW.'
    );
  });

  test('holds an open map to briefs and ON FAILURE, a closed one not', () => {
    const stripped = DESCRIPTION.replace(
      '  Independent of the rest.\n',
      ''
    ).replace(/ON FAILURE\n[\s\S]*$/, '');
    expect(problemsOf(stripped)).toEqual(
      expect.arrayContaining([
        '1 QUEUE row has no brief — ordering alone is not a brief.',
        'No ON FAILURE — a red gate at 03:00 has no written answer.'
      ])
    );
    const closed = parseMap(
      mapIssue({ description: stripped, status: 'closed' })
    );
    expect(closed.problems).toEqual([]);
  });

  test('warns when QUERY is missing, errors when the queue is empty', () => {
    const map = parseMap(
      mapIssue({ description: 'SESSION MAP v1\nGATE: human\nDATE: 2026-08-05' })
    );
    expect(map.problems.map((p) => `${p.level}: ${p.message}`)).toEqual([
      'warn: Missing QUERY — drift cannot be rechecked against the same filter.',
      'error: QUEUE is empty.',
      'warn: No ON FAILURE — a red gate at 03:00 has no written answer.'
    ]);
  });

  test('does not read anything out of a map without a marker', () => {
    const map = parseMap(mapIssue({ description: 'no marker here' }));
    expect(validateMap(map)).toHaveLength(1);
  });
});

describe('data/session-map overlay', () => {
  const map = parseMap(mapIssue());
  const live = {
    closed: items(['acme-aaa']),
    wip: items(['acme-bbb']),
    ready: items(['acme-ccc', 'acme-new']),
    blocked: items([])
  };

  test('overlays live status without mutating the parsed map', () => {
    const view = overlay(map, live);
    expect(view.map.queue.map((q) => q.live)).toEqual([
      'closed',
      'wip',
      'ready'
    ]);
    expect(map.queue.map((q) => q.live)).toEqual([
      'unknown',
      'unknown',
      'unknown'
    ]);
    expect(view).toMatchObject({ done: 1, running: 1, remaining: 2 });
    expect(view.next?.id).toBe('acme-bbb');
  });

  test('opens a chain once its head has closed', () => {
    const view = overlay(map, live);
    expect(view.opened_chains).toEqual([['acme-aaa', 'acme-eee', 'acme-fff']]);
  });

  test('indexes traps by the row they endanger', () => {
    const view = overlay(map, live);
    expect(view.traps_by_id.get('acme-ccc')?.[0].title).toBe(
      'SOFT ACCEPTANCE CRITERION'
    );
    expect(view.traps_by_id.has('acme-aaa')).toBe(false);
  });

  test('reports ready work the map does not mention', () => {
    const view = overlay(map, live);
    expect(view.drift_applies).toBe(true);
    expect(view.ready_not_in_map.map((it) => it.id)).toEqual(['acme-new']);
    expect(view.missing_from_live).toEqual([]);
  });

  test('excludes gated, epic and out-of-scope work from drift', () => {
    const view = overlay(map, {
      ...live,
      ready: [
        ...items(['acme-ccc']),
        { id: 'acme-gated', issue_type: 'task', labels: ['human'] },
        { id: 'acme-epic', issue_type: 'epic', labels: [] },
        { id: 'acme-jjj', issue_type: 'task', labels: [] }
      ]
    });
    expect(view.ready_not_in_map).toEqual([]);
  });

  test('reports queue rows that no live list knows about', () => {
    const view = overlay(map, { ...live, ready: items(['acme-new']) });
    expect(view.missing_from_live.map((q) => q.id)).toEqual(['acme-ccc']);
  });

  test('skips drift for a closed session and for a foreign workspace', () => {
    const closed = overlay(parseMap(mapIssue({ status: 'closed' })), live);
    expect(closed.matched).toBe(true);
    expect(closed.drift_applies).toBe(false);
    expect(closed.ready_not_in_map).toEqual([]);

    const foreign = overlay(map, {
      ready: items(['other-1']),
      wip: [],
      blocked: [],
      closed: []
    });
    expect(foreign.matched).toBe(false);
    expect(foreign.drift_applies).toBe(false);
  });

  test('survives empty live lists', () => {
    const view = overlay(map, /** @type {any} */ ({}));
    expect(view.done).toBe(0);
    expect(view.map.queue.every((q) => q.live === 'unknown')).toBe(true);
  });
});

describe('data/session-map isSessionMapIssue', () => {
  test('matches on the label, then on the marker', () => {
    expect(isSessionMapIssue({ id: 'a', labels: ['session-map'] })).toBe(true);
    expect(
      isSessionMapIssue({ id: 'a', description: '  SESSION MAP v1\nDATE: x' })
    ).toBe(true);
  });

  test('does not match ordinary issues', () => {
    expect(isSessionMapIssue(null)).toBe(false);
    expect(isSessionMapIssue({ id: 'a', labels: ['bug'] })).toBe(false);
    expect(
      isSessionMapIssue({ id: 'a', description: 'mentions SESSION MAP v1' })
    ).toBe(false);
  });
});
