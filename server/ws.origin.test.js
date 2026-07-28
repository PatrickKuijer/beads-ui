import { createServer } from 'node:http';
import { afterEach, describe, expect, test } from 'vitest';
import { WebSocket } from 'ws';
import { attachWsServer } from './ws.js';

/**
 * CSWSH (Cross-Site WebSocket Hijacking) regression tests.
 *
 * Browsers always send an `Origin` header on cross-origin (and same-origin)
 * WebSocket upgrade requests, so `verifyClient` can use it to reject pages
 * that are not the app itself. Non-browser clients (CLI tools, native
 * WebSocket clients) typically don't send an `Origin` header at all — the
 * CSWSH threat model is specifically about a malicious page running in a
 * victim's browser, which always sends Origin, so absence of the header is
 * allowed through.
 */

describe('ws Origin verification (CSWSH)', () => {
  /** @type {import('node:http').Server | undefined} */
  let server;

  afterEach(async () => {
    const current = server;
    if (current) {
      await new Promise((resolve) => current.close(() => resolve(undefined)));
      server = undefined;
    }
  });

  /**
   * @returns {Promise<{ server: import('node:http').Server, port: number }>}
   */
  async function startServer() {
    const http_server = createServer();
    server = http_server;
    attachWsServer(http_server, {
      path: '/ws',
      allowed_origin: 'http://127.0.0.1:3000'
    });
    await new Promise((resolve) =>
      http_server.listen(0, '127.0.0.1', () => resolve(undefined))
    );
    const address = http_server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    return { server: http_server, port };
  }

  test('matching Origin header is accepted', async () => {
    const { port } = await startServer();
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      headers: { Origin: 'http://127.0.0.1:3000' }
    });
    await new Promise((resolve, reject) => {
      ws.once('open', () => resolve(undefined));
      ws.once('error', reject);
    });
    ws.close();
  });

  test('mismatched Origin header is rejected', async () => {
    const { port } = await startServer();
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      headers: { Origin: 'http://evil.example.com' }
    });
    await expect(
      new Promise((resolve, reject) => {
        ws.once('open', () =>
          reject(new Error('connection unexpectedly opened'))
        );
        ws.once('error', (err) => resolve(err));
        ws.once('unexpected-response', () => resolve(true));
      })
    ).resolves.toBeDefined();
  });

  test('missing Origin header is accepted (non-browser clients)', async () => {
    const { port } = await startServer();
    // The `ws` client does not send an Origin header unless explicitly given
    // one, mirroring CLI/native WebSocket clients.
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((resolve, reject) => {
      ws.once('open', () => resolve(undefined));
      ws.once('error', reject);
    });
    ws.close();
  });
});
