import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** A fresh loopback-only server with an OS-assigned port and disposable statistics. */
export async function startTestServer(settings: Record<string, string> = {}) {
  const scratchRoot = resolve(tmpdir());
  const directory = await mkdtemp(join(scratchRoot, 'lumera-test-'));
  const server = spawn(process.execPath, ['--import', 'tsx', join(here, '../src/server.ts')], {
    cwd: join(here, '..'),
    env: {
      ...process.env, ...settings,
      HOST: '127.0.0.1', PORT: '0', STATS_FILE: join(directory, 'stats.json'),
      PUBLIC_DIR: join(directory, 'public'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const collect = (data: unknown) => { output = (output + String(data)).slice(-8000); };
  server.stdout.on('data', collect);
  server.stderr.on('data', collect);
  let stopping: Promise<void> | undefined;
  const stop = (): Promise<void> => stopping ??= (async () => {
    if (server.pid && server.exitCode === null && server.signalCode === null) {
      const exited = once(server, 'exit');
      server.kill();
      await exited;
    }
    // Guard the exact generated directory before recursive cleanup, including on Windows.
    assert.equal(dirname(resolve(directory)), scratchRoot);
    assert.ok(basename(directory).startsWith('lumera-test-'));
    await rm(directory, { recursive: true, force: true });
  })();
  try {
    const port = await new Promise<number>((resolvePort, reject) => {
      const timer = setTimeout(() => reject(new Error(`Server startup timed out: ${output}`)), 5000);
      server.once('error', (error) => { clearTimeout(timer); reject(error); });
      server.once('exit', () => { clearTimeout(timer); reject(new Error(`Server exited: ${output}`)); });
      server.stdout.on('data', () => {
        const match = /ws:\/\/127\.0\.0\.1:(\d+)\/ws/.exec(output);
        if (!match) return;
        clearTimeout(timer);
        resolvePort(Number(match[1]));
      });
    });
    return { port, url: `ws://127.0.0.1:${port}/ws`, stop, output: () => output };
  } catch (error) {
    await stop();
    throw error;
  }
}
