import { runBdJson } from './bd.js';
import { debug } from './logging.js';

const log = debug('list-adapters');

/**
 * Build concrete `bd` CLI args for a subscription type + params.
 * Always includes `--json` for parseable output.
 *
 * @param {{ type: string, params?: Record<string, string | number | boolean> }} spec
 * @returns {string[]}
 */
export function mapSubscriptionToBdArgs(spec) {
  const t = String(spec.type);
  switch (t) {
    case 'all-issues': {
      // `--limit 0` = unlimited. Without it, `bd list` caps at its default 50.
      return ['list', '--json', '--tree=false', '--limit', '0'];
    }
    case 'epics': {
      // `bd epic status` silently excludes closed epics (and doesn't expose
      // a `--status` filter to include them), so the Epics tab would never
      // show closed epics. Use `bd list --type=epic` across all statuses
      // instead; per-epic child/status rollups are computed client-side from
      // the ready/blocked/in-progress/closed subscriptions (same source of
      // truth Board swimlanes use), not from bd's counters.
      return [
        'list',
        '--json',
        '--tree=false',
        '--type',
        'epic',
        '--status',
        'open,in_progress,blocked,deferred,closed',
        '--limit',
        '0'
      ];
    }
    case 'blocked-issues': {
      return ['blocked', '--json'];
    }
    case 'ready-issues': {
      return ['ready', '--limit', '1000', '--json'];
    }
    case 'in-progress-issues': {
      // `--limit 0` = unlimited. Without it, `bd list` caps at its default 50.
      return [
        'list',
        '--json',
        '--tree=false',
        '--status',
        'in_progress',
        '--limit',
        '0'
      ];
    }
    case 'closed-issues': {
      return [
        'list',
        '--json',
        '--tree=false',
        '--status',
        'closed',
        '--limit',
        '1000'
      ];
    }
    case 'issue-detail': {
      const p = spec.params || {};
      const id = String(p.id || '').trim();
      if (id.length === 0) {
        throw badRequest('Missing param: params.id');
      }
      return ['show', id, '--json', '--include-dependents'];
    }
    default: {
      throw badRequest(`Unknown subscription type: ${t}`);
    }
  }
}

/**
 * Normalize bd list output to minimal Issue shape used by the registry.
 * - Ensures `id` is a string.
 * - Coerces timestamps to numbers.
 * - `closed_at` defaults to null when missing or invalid.
 *
 * @param {unknown} value
 * @returns {Array<{ id: string, created_at: number, updated_at: number, closed_at: number | null } & Record<string, unknown>>}
 */
export function normalizeIssueList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  /** @type {Array<{ id: string, created_at: number, updated_at: number, closed_at: number | null } & Record<string, unknown>>} */
  const out = [];
  for (const it of value) {
    const id = String(it.id ?? '');
    if (id.length === 0) {
      continue;
    }
    const created_at = parseTimestamp(/** @type {any} */ (it).created_at);
    const updated_at = parseTimestamp(it.updated_at);
    const closed_raw = it.closed_at;
    /** @type {number | null} */
    let closed_at = null;
    if (closed_raw !== undefined && closed_raw !== null) {
      const n = parseTimestamp(closed_raw);
      closed_at = Number.isFinite(n) ? n : null;
    }
    // `bd list`/`bd ready` expose the parent-child link via a top-level
    // `parent` string field, not `epic_id` - the client-side Issue shape
    // expects `epic_id`, so derive it here for every consumer. `bd blocked`
    // omits `parent` entirely (bd 1.1.0), so it is backfilled upstream by
    // backfillParents(); an existing `epic_id` is honoured as a last resort
    // rather than clobbered.
    const parent = /** @type {any} */ (it).parent;
    const existing = /** @type {any} */ (it).epic_id;
    /** @type {string | null} */
    let epic_id = null;
    if (typeof parent === 'string' && parent.length > 0) {
      epic_id = parent;
    } else if (typeof existing === 'string' && existing.length > 0) {
      epic_id = existing;
    }
    out.push({
      ...it,
      id,
      epic_id,
      created_at: Number.isFinite(created_at) ? created_at : 0,
      updated_at: Number.isFinite(updated_at) ? updated_at : 0,
      closed_at
    });
  }
  return out;
}

/**
 * @typedef {Object} FetchListResultSuccess
 * @property {true} ok
 * @property {Array<{ id: string, updated_at: number, closed_at: number | null } & Record<string, unknown>>} items
 */

/**
 * @typedef {Object} FetchListResultFailure
 * @property {false} ok
 * @property {{ code: string, message: string, details?: Record<string, unknown> }} error
 */

/**
 * Execute the mapped `bd` command for a subscription spec and return normalized items.
 * Errors do not throw; they are surfaced as a structured object.
 *
 * @param {{ type: string, params?: Record<string, string | number | boolean> }} spec
 * @param {{ cwd?: string }} [options] - Optional working directory for bd command
 * @returns {Promise<FetchListResultSuccess | FetchListResultFailure>}
 */
export async function fetchListForSubscription(spec, options = {}) {
  /** @type {string[]} */
  let args;
  try {
    args = mapSubscriptionToBdArgs(spec);
  } catch (err) {
    // Surface bad requests (e.g., missing params)
    log('mapSubscriptionToBdArgs failed for %o: %o', spec, err);
    const e = toErrorObject(err);
    return { ok: false, error: e };
  }

  try {
    const res = await runBdJson(args, { cwd: options.cwd });
    if (!res || res.code !== 0 || !('stdoutJson' in res)) {
      log(
        'bd failed for %o (args=%o) code=%s stderr=%s',
        spec,
        args,
        res?.code,
        res?.stderr || ''
      );
      return {
        ok: false,
        error: {
          code: 'bd_error',
          message: String(res?.stderr || 'bd failed'),
          details: { exit_code: res?.code ?? -1 }
        }
      };
    }
    // bd show may return a single object; normalize to an array first
    let raw = Array.isArray(res.stdoutJson)
      ? res.stdoutJson
      : res.stdoutJson && typeof res.stdoutJson === 'object'
        ? [res.stdoutJson]
        : [];

    if (spec.type === 'blocked-issues') {
      raw = await backfillParents(raw, { cwd: options.cwd });
    }

    const items = normalizeIssueList(raw);
    return { ok: true, items };
  } catch (err) {
    log('bd invocation failed for %o (args=%o): %o', spec, args, err);
    return {
      ok: false,
      error: {
        code: 'bd_error',
        message:
          (err && /** @type {any} */ (err).message) || 'bd invocation failed'
      }
    };
  }
}

/**
 * Fill in the missing `parent` field on `bd blocked --json` rows.
 *
 * `bd blocked` (bd 1.1.0) is the one list command that does not emit the
 * top-level `parent` string, so without this every blocked issue normalizes to
 * `epic_id: null` and gets grouped into the Board's "No epic - orphan issues"
 * lane and dropped from the Epics rollups, even when it has a parent epic.
 *
 * One `bd list` call covers the whole set: blocked issues are never closed, so
 * they are all present in the default (non-closed) listing. A failure here is
 * not fatal - the rows are returned unchanged, i.e. the pre-existing behaviour.
 *
 * @param {any[]} rows
 * @param {{ cwd?: string }} [options]
 * @returns {Promise<any[]>}
 */
async function backfillParents(rows, options = {}) {
  const needs_parent = rows.some(
    (it) => typeof it?.parent !== 'string' || it.parent.length === 0
  );
  if (!needs_parent) {
    return rows;
  }
  /** @type {Map<string, string>} */
  const parent_by_id = new Map();
  try {
    const res = await runBdJson(
      ['list', '--json', '--tree=false', '--limit', '0'],
      {
        cwd: options.cwd
      }
    );
    if (!res || res.code !== 0 || !Array.isArray(res.stdoutJson)) {
      log('parent backfill: bd list failed code=%s', res?.code);
      return rows;
    }
    for (const it of res.stdoutJson) {
      const id = String(/** @type {any} */ (it)?.id ?? '');
      const parent = /** @type {any} */ (it)?.parent;
      if (id.length > 0 && typeof parent === 'string' && parent.length > 0) {
        parent_by_id.set(id, parent);
      }
    }
  } catch (err) {
    log('parent backfill failed: %o', err);
    return rows;
  }
  return rows.map((it) => {
    if (typeof it?.parent === 'string' && it.parent.length > 0) {
      return it;
    }
    const parent = parent_by_id.get(String(it?.id ?? ''));
    return parent ? { ...it, parent } : it;
  });
}

/**
 * Create a `bad_request` error object.
 *
 * @param {string} message
 */
function badRequest(message) {
  const e = new Error(message);
  // @ts-expect-error add code
  e.code = 'bad_request';
  return e;
}

/**
 * Normalize arbitrary thrown values to a structured error object.
 *
 * @param {unknown} err
 * @returns {FetchListResultFailure['error']}
 */
function toErrorObject(err) {
  if (err && typeof err === 'object') {
    const any = /** @type {{ code?: unknown, message?: unknown }} */ (err);
    const code = typeof any.code === 'string' ? any.code : 'bad_request';
    const message =
      typeof any.message === 'string' ? any.message : 'Request error';
    return { code, message };
  }
  return { code: 'bad_request', message: 'Request error' };
}

/**
 * Parse a bd timestamp string to epoch ms using Date.parse.
 * Falls back to numeric coercion when parsing fails.
 *
 * @param {unknown} v
 * @returns {number}
 */
function parseTimestamp(v) {
  if (typeof v === 'string') {
    const ms = Date.parse(v);
    if (Number.isFinite(ms)) {
      return ms;
    }
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof v === 'number') {
    return Number.isFinite(v) ? v : 0;
  }
  return 0;
}
