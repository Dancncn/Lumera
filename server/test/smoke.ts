import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

const here = dirname(fileURLToPath(import.meta.url));
const staging = await mkdtemp(join(tmpdir(), 'lumera-smoke-'));
let child: ReturnType<typeof spawn> | undefined;
let socket: WebSocket | undefined;
let exited: Promise<void> | undefined;
try {
  // Exercise the same standalone layout that is uploaded to a release directory.
  await cp(join(here, '../dist/server.js'), join(staging, 'server.js'));
  await cp(join(here, '../../web/dist'), join(staging, 'public'), { recursive: true });
  child = spawn(process.execPath, [join(staging, 'server.js')], {
    cwd: staging,
    env: { ...process.env, HOST: '127.0.0.1', PORT: '0', PUBLIC_DIR: 'public', STATS_FILE: join(staging, 'state/stats.json') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '', errors = '';
  let spawnError: Error | undefined;
  child.once('error', error => { spawnError = error; });
  child.stdout!.on('data', data => { output += data.toString(); });
  child.stderr!.on('data', data => { errors += data.toString(); });
  exited = new Promise(resolve => child!.once('close', () => resolve()));
  const deadline = Date.now() + 10_000;
  while (!/ws:\/\/127\.0\.0\.1:(\d+)\/ws/.test(output)) {
    if (spawnError) throw spawnError;
    if (child.exitCode !== null) throw new Error(`Built server exited: ${errors}`);
    if (Date.now() > deadline) throw new Error(`Built server startup timed out: ${errors}`);
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  const port = Number(output.match(/ws:\/\/127\.0\.0\.1:(\d+)\/ws/)![1]);
  assert.ok(port > 0, 'Server must report its actual bound port');
  const base = `http://127.0.0.1:${port}`;
  const health = await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(5000) });
  const healthBody: unknown = await health.json();
  assert.ok(healthBody && typeof healthBody === 'object' && 'ok' in healthBody && healthBody.ok === true);
  const page = await fetch(base, { signal: AbortSignal.timeout(5000) });
  assert.equal(page.status, 200);
  const html = await page.text();
  const assetPath = html.match(/src="([^"]+\.js)"/)?.[1];
  assert.ok(assetPath, 'Built page must reference its script');
  const asset = await fetch(`${base}${assetPath}`, { signal: AbortSignal.timeout(5000) });
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get('content-type') ?? '', /javascript/);

  socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Built server did not admit the player')), 5000);
    socket!.on('error', error => { clearTimeout(timer); reject(error); });
    socket!.on('open', () => socket!.send(JSON.stringify({ t: 'join', roomId: 'smoke', token: 'smoke-token', name: 'Smoke', players: 2 })));
    socket!.on('message', raw => {
      const message = JSON.parse(raw.toString());
      if (message.t === 'joined') { clearTimeout(timer); resolve(); }
    });
  });
  console.log('✓ Standalone production bundle: health, HTML, JavaScript asset and WebSocket join');
} finally {
  socket?.terminate();
  if (child && child.exitCode === null) child.kill();
  await exited;
  assert.ok(staging.startsWith(join(tmpdir(), 'lumera-smoke-')));
  await rm(staging, { recursive: true, force: true });
}
