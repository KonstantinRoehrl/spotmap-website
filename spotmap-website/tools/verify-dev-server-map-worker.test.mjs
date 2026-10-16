/**
 * Tests for the dev-server check in verify-dev-server-map-worker.mjs.
 *
 * The check itself needs a real `ng serve`, which takes about a minute, so what is worth testing
 * here is the one thing that goes wrong before the dev server ever starts: a port somebody else is
 * already answering on. The check then walks that server's module graph and reports its verdict
 * about maplibre from it.
 */
import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const check = join(
  dirname(fileURLToPath(import.meta.url)),
  'verify-dev-server-map-worker.mjs',
);

test('refuses a port another server already answers on, instead of walking it', async () => {
  const unrelated = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(
      '<html><body><script src="app.js" type="module"></script></body></html>',
    );
  });
  const port = await listen(unrelated);

  try {
    const result = await run(check, String(port));

    assert.equal(
      result.status,
      1,
      `the check did not refuse port ${port}, which it does not own (exit ${result.status})`,
    );
    assert.match(result.stderr, new RegExp(`port ${port} is already in use`));
  } finally {
    unrelated.close();
  }
});

/**
 * Runs the check as a child process, killing it if it keeps going: a check that starts a dev
 * server on a port it does not own must not spend this test's lifetime waiting for one. It has to
 * run asynchronously — `spawnSync` would block the loop this test serves the busy port from.
 */
function run(...args) {
  return new Promise((done) => {
    const child = spawn(process.execPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));

    const giveUp = setTimeout(() => child.kill('SIGKILL'), 30_000);
    child.on('exit', (status) => {
      clearTimeout(giveUp);
      done({ status, stdout, stderr });
    });
  });
}

/** Listens on every loopback address, so `localhost` reaches it the way the check resolves it. */
function listen(server) {
  return new Promise((ready) => {
    server.listen(0, () => ready(server.address().port));
  });
}
