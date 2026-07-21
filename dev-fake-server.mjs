// Temporary visual-testing harness — NOT part of the shipped app.
// Serves the built frontend (app/) and fakes the WS protocol with an
// in-memory sample dataset, so the redesign can be exercised in a real
// browser without a working `bd`/Dolt backend.
//
// Run:  node dev-fake-server.mjs
// Then open http://127.0.0.1:4100

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { WebSocketServer } from 'ws';

const PORT = 4100;
const APP_DIR = join(import.meta.dirname, 'app');

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.map': 'application/json'
};

// --- Sample dataset -------------------------------------------------------

const now = Date.now();
const day = 24 * 60 * 60 * 1000;

/** @type {Map<string, any>} */
const issues = new Map();

function addIssue(it) {
  issues.set(it.id, {
    dependencies: [],
    dependent_count: 0,
    dependency_count: 0,
    ...it
  });
}

addIssue({
  id: 'DEMO-EPIC1',
  title: 'TcAgentPlugin core scaffolding',
  issue_type: 'epic',
  status: 'open',
  priority: 1,
  created_at: now - 20 * day,
  updated_at: now - 1 * day,
  closed_at: null
});
addIssue({
  id: 'DEMO-EPIC2',
  title: 'Diagnostics dashboard',
  issue_type: 'epic',
  status: 'open',
  priority: 2,
  created_at: now - 12 * day,
  updated_at: now - 2 * day,
  closed_at: null
});

addIssue({
  id: 'DEMO-6',
  title: 'Wire up telemetry export for build pipeline',
  issue_type: 'task',
  status: 'open',
  priority: 1,
  epic_id: 'DEMO-EPIC1',
  created_at: now - 9 * day,
  updated_at: now - 9 * day
});
addIssue({
  id: 'DEMO-1',
  title: 'Fix crash when opening plugin settings dialog on cold start',
  issue_type: 'bug',
  status: 'open',
  priority: 0,
  epic_id: 'DEMO-EPIC1',
  dependencies: [{ id: 'DEMO-6', rel: 'blocks' }],
  dependency_count: 1,
  created_at: now - 8 * day,
  updated_at: now - 8 * day
});
addIssue({
  id: 'DEMO-2',
  title: 'Add dark theme toggle to plugin sidebar',
  issue_type: 'feature',
  status: 'open',
  priority: 2,
  epic_id: 'DEMO-EPIC1',
  created_at: now - 7 * day,
  updated_at: now - 7 * day
});
addIssue({
  id: 'DEMO-3',
  title: 'Document TwinCAT project export format',
  issue_type: 'task',
  status: 'open',
  priority: 3,
  epic_id: 'DEMO-EPIC1',
  created_at: now - 6 * day,
  updated_at: now - 6 * day
});
addIssue({
  id: 'DEMO-4',
  title: 'Refactor connection manager to use async retries',
  issue_type: 'task',
  status: 'in_progress',
  priority: 1,
  epic_id: 'DEMO-EPIC1',
  created_at: now - 5 * day,
  updated_at: now - 3 * 60 * 60 * 1000
});
addIssue({
  id: 'DEMO-5',
  title: 'Bump build tooling to latest LTS',
  issue_type: 'chore',
  status: 'closed',
  priority: 3,
  epic_id: 'DEMO-EPIC1',
  created_at: now - 10 * day,
  updated_at: now - 1 * 60 * 60 * 1000,
  closed_at: now - 30 * 60 * 1000
});

addIssue({
  id: 'DEMO-7',
  title: 'Sketch diagnostics dashboard layout',
  issue_type: 'feature',
  status: 'open',
  priority: 2,
  epic_id: 'DEMO-EPIC2',
  created_at: now - 4 * day,
  updated_at: now - 4 * day
});
addIssue({
  id: 'DEMO-8',
  title: 'Spike: live metrics polling interval',
  issue_type: 'bug',
  status: 'closed',
  priority: 0,
  epic_id: 'DEMO-EPIC2',
  created_at: now - 3 * day,
  updated_at: now - 2 * 60 * 60 * 1000,
  closed_at: now - 2 * 60 * 60 * 1000
});

addIssue({
  id: 'DEMO-9',
  title: 'Investigate intermittent test flake in CI matrix',
  issue_type: 'bug',
  status: 'open',
  priority: 1,
  epic_id: null,
  created_at: now - 2 * day,
  updated_at: now - 2 * day
});
addIssue({
  id: 'DEMO-10',
  title: 'Upgrade logging library to structured JSON output',
  issue_type: 'task',
  status: 'in_progress',
  priority: 2,
  epic_id: null,
  created_at: now - 1 * day,
  updated_at: now - 30 * 60 * 1000
});

// --- Derived views ----------------------------------------------------

function isOpenBlocker(dep) {
  if (!dep || dep.rel !== 'blocks') return false;
  const target = issues.get(dep.id);
  return !!target && target.status !== 'closed';
}

function isBlocked(it) {
  return (
    it.status === 'open' &&
    Array.isArray(it.dependencies) &&
    it.dependencies.some(isOpenBlocker)
  );
}

function listFor(type) {
  const all = Array.from(issues.values()).filter(
    (it) => it.issue_type !== 'epic'
  );
  switch (type) {
    case 'all-issues':
      return all;
    case 'blocked-issues':
      return all.filter((it) => isBlocked(it));
    case 'ready-issues':
      return all.filter((it) => it.status === 'open' && !isBlocked(it));
    case 'in-progress-issues':
      return all.filter((it) => it.status === 'in_progress');
    case 'closed-issues':
      return all.filter((it) => it.status === 'closed');
    case 'epics':
      return Array.from(issues.values())
        .filter((it) => it.issue_type === 'epic')
        .map((epic) => {
          const children = all.filter((it) => it.epic_id === epic.id);
          return {
            ...epic,
            total_children: children.length,
            closed_children: children.filter((c) => c.status === 'closed')
              .length
          };
        });
    default:
      return [];
  }
}

function detailFor(id) {
  const it = issues.get(id);
  if (!it) return null;
  const dependents =
    it.issue_type === 'epic'
      ? Array.from(issues.values()).filter((c) => c.epic_id === id)
      : [];
  const dependencies = (it.dependencies || []).map((d) => {
    const target = issues.get(d.id);
    return { ...d, title: target?.title, status: target?.status };
  });
  return { ...it, dependencies, dependents };
}

// --- WS protocol fake ---------------------------------------------------

/** client_id -> { type, params } */
const revisions = new Map();

function nextRevision(client_id) {
  const n = (revisions.get(client_id) || 0) + 1;
  revisions.set(client_id, n);
  return n;
}

function send(ws, msg) {
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    // ignore
  }
}

function pushSnapshot(ws, client_id, spec) {
  const issuesForSpec =
    spec.type === 'issue-detail'
      ? [detailFor(String(spec.params?.id || ''))].filter(Boolean)
      : listFor(spec.type);
  send(ws, {
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ok: true,
    type: 'snapshot',
    payload: {
      type: 'snapshot',
      id: client_id,
      revision: nextRevision(client_id),
      issues: issuesForSpec
    }
  });
}

const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws) => {
  /** @type {Map<string, { type: string, params?: any }>} */
  const subs = new Map();

  function broadcastAffected() {
    for (const [client_id, spec] of subs.entries()) {
      pushSnapshot(ws, client_id, spec);
    }
  }

  ws.on('message', (raw) => {
    let req;
    try {
      req = JSON.parse(String(raw));
    } catch {
      return;
    }
    const { id, type, payload } = req;

    if (type === 'list-workspaces') {
      send(ws, {
        id,
        ok: true,
        type,
        payload: {
          workspaces: [{ path: '/demo/workspace', database: 'demo.db' }],
          current: { root_dir: '/demo/workspace', db_path: 'demo.db' }
        }
      });
      return;
    }

    if (type === 'subscribe-list') {
      const spec = { type: payload.type, params: payload.params };
      subs.set(payload.id, spec);
      send(ws, { id, ok: true, type, payload: {} });
      pushSnapshot(ws, payload.id, spec);
      return;
    }

    if (type === 'unsubscribe-list') {
      subs.delete(payload.id);
      send(ws, { id, ok: true, type, payload: {} });
      return;
    }

    if (type === 'update-status') {
      const it = issues.get(payload.id);
      if (it) {
        it.status = payload.status;
        it.updated_at = Date.now();
        it.closed_at = payload.status === 'closed' ? Date.now() : null;
      }
      send(ws, { id, ok: true, type, payload: it || {} });
      broadcastAffected();
      return;
    }

    if (type === 'update-priority') {
      const it = issues.get(payload.id);
      if (it) it.priority = payload.priority;
      send(ws, { id, ok: true, type, payload: it || {} });
      broadcastAffected();
      return;
    }

    if (type === 'edit-text') {
      const it = issues.get(payload.id);
      if (it && payload.field && typeof payload.value === 'string') {
        it[payload.field] = payload.value;
      }
      send(ws, { id, ok: true, type, payload: it || {} });
      broadcastAffected();
      return;
    }

    // Best-effort ack for everything else (assignee/labels/comments/deps/etc.)
    send(ws, {
      id,
      ok: true,
      type,
      payload: issues.get(payload?.id) || {}
    });
  });
});

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let path = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = join(APP_DIR, path);
  try {
    const data = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file)] || 'application/octet-stream'
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

server.on('upgrade', (req, socket, head) => {
  if (new URL(req.url, 'http://x').pathname === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
  } else {
    socket.destroy();
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Fake beads-ui server: http://127.0.0.1:${PORT}`);
});
