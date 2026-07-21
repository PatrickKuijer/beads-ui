import { describe, expect, test } from 'vitest';
import { createSubscriptionIssueStore } from '../data/subscription-issue-store.js';
import { createBoardView } from './board.js';

function createTestIssueStores() {
  /** @type {Map<string, any>} */
  const stores = new Map();
  /** @type {Set<() => void>} */
  const listeners = new Set();
  /**
   * @param {string} id
   * @returns {any}
   */
  function getStore(id) {
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
  }
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

describe('views/board epic swimlanes', () => {
  test('groups cards into per-epic lanes and a trailing "No epic" lane', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));

    const issueStores = createTestIssueStores();
    issueStores.getStore('tab:board:epics').applyPush({
      type: 'snapshot',
      id: 'tab:board:epics',
      revision: 1,
      issues: [
        {
          id: 'EPIC-1',
          title: 'Alpha epic',
          issue_type: 'epic',
          total_children: 2,
          closed_children: 1
        }
      ]
    });
    issueStores.getStore('tab:board:ready').applyPush({
      type: 'snapshot',
      id: 'tab:board:ready',
      revision: 1,
      issues: [
        { id: 'R-1', title: 'in epic', epic_id: 'EPIC-1', priority: 1 },
        { id: 'R-2', title: 'no epic', epic_id: null, priority: 1 }
      ]
    });
    issueStores.getStore('tab:board:closed').applyPush({
      type: 'snapshot',
      id: 'tab:board:closed',
      revision: 1,
      issues: [
        {
          id: 'C-1',
          title: 'closed in epic',
          epic_id: 'EPIC-1',
          closed_at: Date.now()
        }
      ]
    });

    const view = createBoardView(
      mount,
      null,
      () => {},
      undefined,
      undefined,
      issueStores
    );
    await view.load();

    /** @type {HTMLElement[]} */
    const lanes = Array.from(mount.querySelectorAll('.board-lane'));
    expect(lanes.length).toBe(2);

    // Named epic lane comes first, "No epic" lane last
    expect(lanes[0].getAttribute('data-epic-id')).toBe('EPIC-1');
    expect(lanes[1].getAttribute('data-epic-id')).toBe('');

    const epic_lane_title = lanes[0]
      .querySelector('.board-lane__title')
      ?.textContent?.trim();
    expect(epic_lane_title).toBe('Alpha epic');

    const epic_ready_ids = Array.from(
      lanes[0].querySelectorAll('[data-board-column="ready"] .board-card .mono')
    ).map((el) => el.textContent?.trim());
    expect(epic_ready_ids).toEqual(['R-1']);

    const no_epic_ready_ids = Array.from(
      lanes[1].querySelectorAll('[data-board-column="ready"] .board-card .mono')
    ).map((el) => el.textContent?.trim());
    expect(no_epic_ready_ids).toEqual(['R-2']);

    // Lane progress label reflects the epic's own counters
    const progress_label = lanes[0]
      .querySelector('.board-lane__progress-label')
      ?.textContent?.trim();
    expect(progress_label).toBe('1/2 done');
  });

  test('collapsing a lane hides its body but keeps the header', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));

    const issueStores = createTestIssueStores();
    issueStores.getStore('tab:board:ready').applyPush({
      type: 'snapshot',
      id: 'tab:board:ready',
      revision: 1,
      issues: [{ id: 'R-1', title: 'r1', epic_id: null }]
    });

    const view = createBoardView(
      mount,
      null,
      () => {},
      undefined,
      undefined,
      issueStores
    );
    await view.load();

    expect(mount.querySelector('.board-lane__body')).not.toBeNull();

    const header = /** @type {HTMLElement} */ (
      mount.querySelector('.board-lane__header')
    );
    header.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(mount.querySelector('.board-lane__body')).toBeNull();
    expect(header.getAttribute('aria-expanded')).toBe('false');
  });
});
