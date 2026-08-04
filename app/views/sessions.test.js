import { describe, expect, test, vi } from 'vitest';
import { createSessionsView } from './sessions.js';

const DESCRIPTION = `SESSION MAP v1
DATE: 2026-08-05
GATE: human
QUERY: bd ready --exclude-label human
RUNWAY: 3 ready now

QUEUE
1. acme-aaa   P2  First thing
  First because it heads the chain.
2. acme-bbb   P3  Second thing
  Independent.
3. acme-ccc   P4  Third thing
  Last.

CHAINS
acme-aaa -> acme-eee

DECISIONS
acme-hhh  Which of (a) or (b) for the clock.

TRAPS
1. WRONG DESCRIPTIONS. Read the notes, not the description.
AFFECTS: acme-ccc

QUALITY GATE
CMD: npm run all
EXPECT: green

ON FAILURE
One fix attempt, then move on.
`;

const OLDER = `SESSION MAP v1
DATE: 2026-08-01
GATE: human
QUERY: bd ready --exclude-label human

QUEUE
1. acme-zzz   P2  An older thing
  Done long ago.

ON FAILURE
Stop.
`;

/** @param {string[]} ids */
function items(ids) {
  return ids.map((id) => ({ id, issue_type: 'task', labels: [], title: id }));
}

/**
 * @param {{
 *   maps?: any[],
 *   details?: Record<string, any>,
 *   ready?: any[],
 *   wip?: any[],
 *   blocked?: any[],
 *   closed?: any[]
 * }} [opts]
 */
function setup(opts = {}) {
  document.body.innerHTML = '<div id="m"></div>';
  const mount = /** @type {HTMLElement} */ (document.getElementById('m'));
  const maps = opts.maps || [];
  const details = opts.details || {};
  /** @type {Record<string, any[]>} */
  const lists = {
    'tab:board:ready': opts.ready || [],
    'tab:board:in-progress': opts.wip || [],
    'tab:board:blocked': opts.blocked || [],
    'tab:board:closed': [...(opts.closed || []), ...maps]
  };
  const unsub = vi.fn(async () => {});
  const issue_stores = {
    /** @param {string} client_id */
    snapshotFor(client_id) {
      if (client_id.startsWith('session-map:')) {
        const found = details[client_id.slice('session-map:'.length)];
        return found ? [found] : [];
      }
      return lists[client_id] || [];
    },
    register: vi.fn(),
    unregister: vi.fn(),
    /** @param {() => void} fn */
    subscribe(fn) {
      return () => void fn;
    }
  };
  const subscriptions = { subscribeList: vi.fn(async () => unsub) };
  const store = { getState: () => ({ view: 'sessions' }), subscribe: vi.fn() };
  const goto_issue = vi.fn();
  const view = createSessionsView(
    mount,
    goto_issue,
    /** @type {any} */ (store),
    /** @type {any} */ (issue_stores),
    /** @type {any} */ (subscriptions)
  );
  return { mount, view, issue_stores, subscriptions, goto_issue, unsub };
}

/**
 * @param {Partial<{ id: string, title: string, status: string, description: string, notes: string }>} patch
 */
function mapBead(patch = {}) {
  return {
    id: 'acme-map',
    title: 'AFK session map: 2026-08-05',
    status: 'open',
    labels: ['session-map'],
    issue_type: 'task',
    ...patch
  };
}

describe('views/sessions', () => {
  test('explains the format when the workspace has no map beads', async () => {
    const { mount, view } = setup();
    await view.load();
    expect(mount.querySelector('.sm-empty')).toBeTruthy();
    expect(mount.textContent).toContain('SESSION MAP v1');
    expect(mount.querySelector('.sm-layout')).toBeFalsy();
  });

  test('asks for the description of each discovered map bead', async () => {
    const bead = mapBead();
    const { view, issue_stores, subscriptions } = setup({ maps: [bead] });
    await view.load();
    expect(issue_stores.register).toHaveBeenCalledWith('session-map:acme-map', {
      type: 'issue-detail',
      params: { id: 'acme-map' }
    });
    expect(subscriptions.subscribeList).toHaveBeenCalledTimes(1);
    // A second render must not re-subscribe.
    await view.load();
    expect(subscriptions.subscribeList).toHaveBeenCalledTimes(1);
  });

  test('renders the queue with live status once the description arrives', async () => {
    const bead = mapBead();
    const { mount, view } = setup({
      maps: [bead],
      details: { 'acme-map': { ...bead, description: DESCRIPTION } },
      closed: items(['acme-aaa']),
      wip: items(['acme-bbb']),
      ready: items(['acme-ccc'])
    });
    await view.load();

    const rows = mount.querySelectorAll('.sm-queue__item');
    expect(rows.length).toBe(3);
    expect(rows[0].className).toContain('sm-queue__item--closed');
    expect(rows[1].className).toContain('sm-queue__item--wip');
    expect(rows[1].className).toContain('sm-queue__item--next');
    expect(rows[2].className).toContain('sm-queue__item--ready');
    // The brief the agent wrote under the row is kept with it.
    expect(mount.textContent).toContain('First because it heads the chain.');
    // Trap pinned by AFFECTS shows on the row it endangers.
    expect(rows[2].textContent).toContain('WRONG DESCRIPTIONS');
    // Chain whose head has closed is marked released.
    expect(mount.querySelector('.sm-chain--open')).toBeTruthy();
    expect(mount.querySelector('.sm-h')?.textContent).toContain('1 closed');
  });

  test('shows the conformance verdict for the parsed map', async () => {
    const bead = mapBead();
    const { mount, view } = setup({
      maps: [bead],
      details: { 'acme-map': { ...bead, description: DESCRIPTION } }
    });
    await view.load();
    expect(mount.querySelector('.sm-conformance__ok')?.textContent).toBe(
      'conforms'
    );
    expect(mount.querySelector('.sm-conformance .sm-chip')?.textContent).toBe(
      'v1'
    );
  });

  test('reports a map bead that is not a v1 document instead of hiding it', async () => {
    const bead = mapBead();
    const { mount, view } = setup({
      maps: [bead],
      details: { 'acme-map': { ...bead, description: 'tonight: do the thing' } }
    });
    await view.load();
    expect(mount.querySelector('.sm-conformance .sm-chip')?.textContent).toBe(
      'unreadable'
    );
    expect(
      mount.querySelector('.sm-conformance__item--error')?.textContent
    ).toContain('No `SESSION MAP v1` marker');
    expect(mount.querySelectorAll('.sm-queue__item').length).toBe(0);
  });

  test('lists the gated decisions and the drift against the map query', async () => {
    const bead = mapBead();
    const { mount, view } = setup({
      maps: [bead],
      details: { 'acme-map': { ...bead, description: DESCRIPTION } },
      wip: items(['acme-bbb']),
      ready: [
        ...items(['acme-ccc', 'acme-new']),
        { id: 'acme-gated', issue_type: 'task', labels: ['human'] }
      ]
    });
    await view.load();
    expect(mount.querySelector('.sm-rail__count')?.textContent).toBe('1');
    expect(mount.querySelector('.sm-decision')?.textContent).toContain(
      'Which of (a) or (b)'
    );
    const drift = mount.querySelector('.sm-drift');
    expect(drift?.textContent).toContain('1 ready and ungated');
    expect(drift?.textContent).toContain('acme-new');
    expect(drift?.textContent).not.toContain('acme-gated');
  });

  test('does not check drift for a closed session', async () => {
    const bead = mapBead({ status: 'closed' });
    const { mount, view } = setup({
      maps: [bead],
      details: { 'acme-map': { ...bead, description: DESCRIPTION } },
      ready: items(['acme-aaa', 'acme-new'])
    });
    await view.load();
    expect(mount.querySelector('.sm-drift')).toBeFalsy();
    expect(mount.querySelector('.sm-rail__ok')?.textContent).toContain(
      'Session closed'
    );
  });

  test('shows the newest map first and switches on a spine click', async () => {
    const newer = mapBead();
    const older = mapBead({
      id: 'acme-old',
      title: 'AFK session map: 2026-08-01',
      status: 'closed'
    });
    const { mount, view } = setup({
      maps: [older, newer],
      details: {
        'acme-map': { ...newer, description: DESCRIPTION },
        'acme-old': { ...older, description: OLDER }
      }
    });
    await view.load();

    const spine = mount.querySelectorAll('.sm-spine__item');
    expect(spine.length).toBe(2);
    expect(spine[0].textContent).toContain('2026-08-05');
    expect(mount.querySelector('.sm-doc__title')?.textContent).toContain(
      '2026-08-05'
    );

    /** @type {HTMLElement} */ (spine[1]).click();
    expect(mount.querySelector('.sm-doc__title')?.textContent).toContain(
      '2026-08-01'
    );
    expect(mount.querySelector('.sm-queue__item')?.textContent).toContain(
      'acme-zzz'
    );
  });

  test('navigates to an issue from a queue row', async () => {
    const bead = mapBead();
    const { mount, view, goto_issue } = setup({
      maps: [bead],
      details: { 'acme-map': { ...bead, description: DESCRIPTION } }
    });
    await view.load();
    const link = /** @type {HTMLAnchorElement} */ (
      mount.querySelector('.sm-queue__item .sm-id')
    );
    expect(link.getAttribute('href')).toBe('#/sessions?issue=acme-aaa');
    link.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(goto_issue).toHaveBeenCalledWith('acme-aaa');
  });

  test('releases the per-map detail subscriptions on clear', async () => {
    const bead = mapBead();
    const { view, issue_stores, unsub } = setup({
      maps: [bead],
      details: { 'acme-map': { ...bead, description: DESCRIPTION } }
    });
    await view.load();
    // Let the subscribeList promise settle so the unsubscribe is recorded.
    await Promise.resolve();
    view.clear();
    expect(unsub).toHaveBeenCalled();
    expect(issue_stores.unregister).toHaveBeenCalledWith(
      'session-map:acme-map'
    );
  });
});
