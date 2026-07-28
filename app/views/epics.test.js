import { describe, expect, test } from 'vitest';
import { createSubscriptionIssueStore } from '../data/subscription-issue-store.js';
import { createSubscriptionStore } from '../data/subscriptions-store.js';
import { createEpicsView } from './epics.js';

/**
 * Builds a fake issue-stores registry backed by real per-subscription
 * stores, matching the shape epics.js expects (snapshotFor/subscribe).
 */
function createFakeIssueStores() {
  const stores = new Map();
  const listeners = new Set();
  /** @param {string} id */
  const getStore = (id) => {
    let s = stores.get(id);
    if (!s) {
      s = createSubscriptionIssueStore(id);
      stores.set(id, s);
      s.subscribe(() => {
        for (const fn of Array.from(listeners)) {
          try {
            fn();
          } catch {
            /* ignore */
          }
        }
      });
    }
    return s;
  };
  return {
    getStore,
    /** @param {string} id */
    snapshotFor(id) {
      return getStore(id).snapshot().slice();
    },
    /** @param {() => void} fn */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }
  };
}

/**
 * @param {string} client_id
 * @param {any} issue_stores
 * @param {any[]} issues
 */
function seed(client_id, issue_stores, issues) {
  issue_stores.getStore(client_id).applyPush({
    type: 'snapshot',
    id: client_id,
    revision: 1,
    issues
  });
}

/**
 * Minimal fake store mirroring the shape used by list.test.js / board.js
 * (getState/setState/subscribe over `filters.search` and `filters.prio`).
 *
 * @param {any} initial_filters
 */
function createFakeStore(initial_filters) {
  return {
    state: { selected_id: null, filters: initial_filters },
    subs: /** @type {((s:any)=>void)[]} */ ([]),
    getState() {
      return this.state;
    },
    /** @param {any} patch */
    setState(patch) {
      this.state = {
        ...this.state,
        ...(patch || {}),
        filters: { ...this.state.filters, ...(patch.filters || {}) }
      };
      for (const fn of this.subs) {
        fn(this.state);
      }
    },
    /** @param {(s:any)=>void} fn */
    subscribe(fn) {
      this.subs.push(fn);
      return () => {
        this.subs = this.subs.filter((f) => f !== fn);
      };
    }
  };
}

describe('views/epics', () => {
  test('loads groups from store and expands to show children, navigates on click', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));
    const issueStores = createFakeIssueStores();
    const subscriptions = createSubscriptionStore(async () => {});
    seed('tab:epics', issueStores, [
      { id: 'UI-1', title: 'Epic One', issue_type: 'epic' }
    ]);
    seed('tab:epics:ready', issueStores, [
      {
        id: 'UI-2',
        title: 'Alpha',
        status: 'open',
        priority: 1,
        issue_type: 'task',
        epic_id: 'UI-1'
      }
    ]);
    seed('tab:epics:closed', issueStores, [
      {
        id: 'UI-3',
        title: 'Beta',
        status: 'closed',
        priority: 2,
        issue_type: 'task',
        epic_id: 'UI-1'
      }
    ]);
    /** @type {string[]} */
    const navCalls = [];
    const view = createEpicsView(
      mount,
      undefined,
      (id) => navCalls.push(id),
      undefined,
      subscriptions,
      /** @type {any} */ (issueStores)
    );
    await view.load();
    const header = mount.querySelector('.epic-header');
    expect(header).not.toBeNull();
    const rows = mount.querySelectorAll('.epic-row');
    expect(rows.length).toBe(2);
    rows[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(navCalls[0]).toBe('UI-2');
  });

  test('sorts children by priority then created_at asc', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));
    const issueStores = createFakeIssueStores();
    const subscriptions = createSubscriptionStore(async () => {});
    seed('tab:epics', issueStores, [
      { id: 'UI-10', title: 'Epic Sort', issue_type: 'epic' }
    ]);
    seed('tab:epics:ready', issueStores, [
      {
        id: 'UI-11',
        title: 'Low priority, newest within p1',
        status: 'open',
        priority: 1,
        issue_type: 'task',
        epic_id: 'UI-10',
        created_at: Date.parse('2025-10-22T10:00:00.000Z')
      },
      {
        id: 'UI-12',
        title: 'Low priority, older',
        status: 'open',
        priority: 1,
        issue_type: 'task',
        epic_id: 'UI-10',
        created_at: Date.parse('2025-10-20T10:00:00.000Z')
      },
      {
        id: 'UI-13',
        title: 'Higher priority number (lower precedence)',
        status: 'open',
        priority: 2,
        issue_type: 'task',
        epic_id: 'UI-10',
        created_at: Date.parse('2025-10-23T10:00:00.000Z')
      }
    ]);
    const view = createEpicsView(
      mount,
      undefined,
      () => {},
      undefined,
      subscriptions,
      /** @type {any} */ (issueStores)
    );
    await view.load();
    const rows = Array.from(mount.querySelectorAll('.epic-row'));
    const ids = rows.map((r) =>
      /** @type {HTMLElement} */ (r.querySelector('.epic-row__id'))
        ?.textContent?.trim()
    );
    expect(ids).toEqual(['UI-12', 'UI-11', 'UI-13']);
  });

  test('keyboard activation (Enter/Space) on a row navigates', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));
    const issueStores = createFakeIssueStores();
    const subscriptions = createSubscriptionStore(async () => {});
    seed('tab:epics', issueStores, [
      { id: 'UI-20', title: 'Epic Keyboard', issue_type: 'epic' }
    ]);
    seed('tab:epics:ready', issueStores, [
      {
        id: 'UI-21',
        title: 'Row',
        status: 'open',
        priority: 2,
        issue_type: 'task',
        epic_id: 'UI-20'
      }
    ]);
    /** @type {string[]} */
    const navCalls = [];
    const view = createEpicsView(
      mount,
      undefined,
      (id) => navCalls.push(id),
      undefined,
      subscriptions,
      /** @type {any} */ (issueStores)
    );
    await view.load();
    const row = mount.querySelector('.epic-row');
    row?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    );
    expect(navCalls).toEqual(['UI-21']);
  });

  test('manual expand/collapse toggles children visibility', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));
    const issueStores = createFakeIssueStores();
    const subscriptions = createSubscriptionStore(async () => {});
    seed('tab:epics', issueStores, [
      { id: 'UI-40', title: 'Auto Expanded', issue_type: 'epic' },
      { id: 'UI-41', title: 'Manual Expand', issue_type: 'epic' }
    ]);
    seed('tab:epics:ready', issueStores, [
      {
        id: 'UI-42',
        title: 'Child',
        status: 'open',
        priority: 2,
        issue_type: 'task',
        epic_id: 'UI-41'
      }
    ]);
    const view = createEpicsView(
      mount,
      undefined,
      () => {},
      undefined,
      subscriptions,
      /** @type {any} */ (issueStores)
    );
    await view.load();
    const groups = Array.from(mount.querySelectorAll('.epic-group'));
    const manual = groups.find(
      (g) => g.getAttribute('data-epic-id') === 'UI-41'
    );
    expect(manual).toBeDefined();
    expect(manual?.querySelector('.epic-children')).toBeNull();
    manual
      ?.querySelector('.epic-header')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(manual?.querySelector('.epic-row')).not.toBeNull();
    manual
      ?.querySelector('.epic-header')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(manual?.querySelector('.epic-children')).toBeNull();
  });

  test('header search filters the top-level epic list', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));
    const issueStores = createFakeIssueStores();
    const subscriptions = createSubscriptionStore(async () => {});
    seed('tab:epics', issueStores, [
      { id: 'UI-50', title: 'Alpha Epic', issue_type: 'epic' },
      { id: 'UI-51', title: 'Beta Epic', issue_type: 'epic' }
    ]);
    const fakeStore = createFakeStore({ search: '', prio: [0, 1, 2, 3] });
    const view = createEpicsView(
      mount,
      undefined,
      () => {},
      /** @type {any} */ (fakeStore),
      subscriptions,
      /** @type {any} */ (issueStores)
    );
    await view.load();
    expect(mount.querySelectorAll('.epic-group').length).toBe(2);

    fakeStore.setState({ filters: { search: 'alpha' } });
    expect(mount.querySelectorAll('.epic-group').length).toBe(1);
    const remaining = mount.querySelector('.epic-group');
    expect(remaining?.getAttribute('data-epic-id')).toBe('UI-50');

    fakeStore.setState({ filters: { search: '' } });
    expect(mount.querySelectorAll('.epic-group').length).toBe(2);
  });

  test('header priority filter narrows the top-level epic list', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));
    const issueStores = createFakeIssueStores();
    const subscriptions = createSubscriptionStore(async () => {});
    seed('tab:epics', issueStores, [
      {
        id: 'UI-60',
        title: 'High Prio Epic',
        issue_type: 'epic',
        priority: 0
      },
      { id: 'UI-61', title: 'Low Prio Epic', issue_type: 'epic', priority: 3 }
    ]);
    const fakeStore = createFakeStore({ search: '', prio: [0, 1, 2, 3] });
    const view = createEpicsView(
      mount,
      undefined,
      () => {},
      /** @type {any} */ (fakeStore),
      subscriptions,
      /** @type {any} */ (issueStores)
    );
    await view.load();
    expect(mount.querySelectorAll('.epic-group').length).toBe(2);

    fakeStore.setState({ filters: { prio: [0] } });
    expect(mount.querySelectorAll('.epic-group').length).toBe(1);
    const remaining = mount.querySelector('.epic-group');
    expect(remaining?.getAttribute('data-epic-id')).toBe('UI-60');

    fakeStore.setState({ filters: { prio: [0, 1, 2, 3] } });
    expect(mount.querySelectorAll('.epic-group').length).toBe(2);
  });

  test('header hide-closed toggle excludes closed epics from the top-level list', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));
    const issueStores = createFakeIssueStores();
    const subscriptions = createSubscriptionStore(async () => {});
    seed('tab:epics', issueStores, [
      { id: 'UI-70', title: 'Open Epic', issue_type: 'epic', status: 'open' },
      {
        id: 'UI-71',
        title: 'Closed Epic',
        issue_type: 'epic',
        status: 'closed'
      }
    ]);
    const fakeStore = createFakeStore({
      search: '',
      prio: [0, 1, 2, 3],
      hideClosed: false
    });
    const view = createEpicsView(
      mount,
      undefined,
      () => {},
      /** @type {any} */ (fakeStore),
      subscriptions,
      /** @type {any} */ (issueStores)
    );
    await view.load();
    expect(mount.querySelectorAll('.epic-group').length).toBe(2);

    fakeStore.setState({ filters: { hideClosed: true } });
    expect(mount.querySelectorAll('.epic-group').length).toBe(1);
    const remaining = mount.querySelector('.epic-group');
    expect(remaining?.getAttribute('data-epic-id')).toBe('UI-70');

    fakeStore.setState({ filters: { hideClosed: false } });
    expect(mount.querySelectorAll('.epic-group').length).toBe(2);
  });

  test('header hide-closed toggle also excludes closed children within an expanded epic', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));
    const issueStores = createFakeIssueStores();
    const subscriptions = createSubscriptionStore(async () => {});
    seed('tab:epics', issueStores, [
      { id: 'UI-80', title: 'Epic With Closed Child', issue_type: 'epic' }
    ]);
    seed('tab:epics:ready', issueStores, [
      {
        id: 'UI-81',
        title: 'Open Child',
        status: 'open',
        priority: 1,
        issue_type: 'task',
        epic_id: 'UI-80'
      }
    ]);
    seed('tab:epics:closed', issueStores, [
      {
        id: 'UI-82',
        title: 'Closed Child',
        status: 'closed',
        priority: 2,
        issue_type: 'task',
        epic_id: 'UI-80'
      }
    ]);
    const fakeStore = createFakeStore({
      search: '',
      prio: [0, 1, 2, 3],
      hideClosed: false
    });
    const view = createEpicsView(
      mount,
      undefined,
      () => {},
      /** @type {any} */ (fakeStore),
      subscriptions,
      /** @type {any} */ (issueStores)
    );
    await view.load();
    expect(mount.querySelectorAll('.epic-row').length).toBe(2);

    fakeStore.setState({ filters: { hideClosed: true } });
    const rows = mount.querySelectorAll('.epic-row');
    expect(rows.length).toBe(1);
    expect(rows[0].querySelector('.epic-row__id')?.textContent).toContain(
      'UI-81'
    );

    fakeStore.setState({ filters: { hideClosed: false } });
    expect(mount.querySelectorAll('.epic-row').length).toBe(2);
  });

  test('computes blocked/ready/wip/closed rollups for the epic header', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));
    const issueStores = createFakeIssueStores();
    const subscriptions = createSubscriptionStore(async () => {});
    seed('tab:epics', issueStores, [
      { id: 'UI-90', title: 'Epic Rollup', issue_type: 'epic' }
    ]);
    seed('tab:epics:blocked', issueStores, [
      {
        id: 'UI-91',
        status: 'open',
        issue_type: 'bug',
        epic_id: 'UI-90'
      }
    ]);
    seed('tab:epics:ready', issueStores, [
      {
        id: 'UI-92',
        status: 'open',
        issue_type: 'task',
        epic_id: 'UI-90'
      }
    ]);
    seed('tab:epics:in-progress', issueStores, [
      {
        id: 'UI-93',
        status: 'in_progress',
        issue_type: 'task',
        epic_id: 'UI-90'
      }
    ]);
    seed('tab:epics:closed', issueStores, [
      {
        id: 'UI-94',
        status: 'closed',
        issue_type: 'task',
        epic_id: 'UI-90'
      },
      {
        id: 'UI-95',
        status: 'closed',
        issue_type: 'task',
        epic_id: 'UI-90'
      }
    ]);
    const view = createEpicsView(
      mount,
      undefined,
      () => {},
      undefined,
      subscriptions,
      /** @type {any} */ (issueStores)
    );
    await view.load();
    const header = /** @type {HTMLElement} */ (
      mount.querySelector('.epic-header')
    );
    expect(header.textContent).toContain('1 blkd');
    expect(header.textContent).toContain('1 ready');
    expect(header.textContent).toContain('1 wip');
    expect(header.textContent).toContain('2/5 done');
  });
});
