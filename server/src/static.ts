import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { IncomingMessage, ServerResponse } from 'node:http';
import { join, normalize, extname, sep } from 'node:path';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

function safeResolve(root: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const clean = normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const full = join(root, clean);
  if (full !== root && !full.startsWith(root + sep)) return null;
  return full;
}

async function tryFile(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isFile();
  } catch {
    return false;
  }
}

function sendFile(res: ServerResponse, path: string, status = 200): void {
  res.writeHead(status, { 'content-type': MIME[extname(path).toLowerCase()] ?? 'application/octet-stream' });
  createReadStream(path).pipe(res);
}

export function makeStaticHandler(root: string) {
  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    const url = req.url ?? '/';
    let resolved = safeResolve(root, url === '/' ? '/index.html' : url);
    if (resolved && (await tryFile(resolved))) {
      sendFile(res, resolved);
      return;
    }
    const index = join(root, 'index.html');
    if (await tryFile(index)) {
      sendFile(res, index);
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404');
  };
}
