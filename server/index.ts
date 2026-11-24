// HTTP (accounts + static files in production) and the WebSocket game server.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { WebSocketServer } from 'ws';
import { STARTER_INVENTORY, STARTER_MATERIALS, STARTER_TOKENS } from '../shared/catalogue';
import { isCleanName, USERNAME_RE } from '../shared/filter';
import { randomLook } from '../shared/avatar';
import { defaultApartmentLayout, layoutItemCounts } from '../shared/rooms';
import { Game } from './game';
import { limits } from './ratelimit';
import { Store, type UserRow } from './store';

const PORT = Number(process.env.PORT ?? 8787);
const DB_FILE = process.env.DB_FILE ?? resolve('data/pebble-court.db');
const DIST = resolve('dist');
const PROD = process.env.NODE_ENV === 'production';

const store = new Store(DB_FILE);
const game = new Game(store);

// ---------------------------------------------------------------- accounts
function hash(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString('hex');
}

function createAccount(username: string, password: string): UserRow {
  const id = randomUUID();
  const apartmentId = `apt-${id.slice(0, 8)}`;
  const layout = defaultApartmentLayout();
  const used = layoutItemCounts(layout);
  const inventory: Record<string, number> = {};
  for (const [item, n] of Object.entries(STARTER_INVENTORY)) {
    const left = n - (used[item] ?? 0);
    if (left > 0) inventory[item] = left;
  }
  const salt = randomBytes(16).toString('hex');
  const row: UserRow = {
    id, username, salt, passHash: hash(password, salt), createdAt: Date.now(),
    data: {
      avatar: randomLook(), tokens: STARTER_TOKENS, inventory, materials: [...STARTER_MATERIALS],
      collection: Object.keys(STARTER_INVENTORY), bonuses: [], apartmentId, isNew: true, activity: {},
    },
  };
  store.createUser(row);
  store.saveRoom({
    id: apartmentId, kind: 'apartment', ownerId: id, ownerName: username, name: `${username}'s flat`,
    shape: 'apartment', access: 'open', layout, createdAt: Date.now(),
  });
  return row;
}

function newSession(userId: string) {
  const token = randomBytes(24).toString('base64url');
  store.createSession(token, userId);
  return token;
}

async function readJson(req: IncomingMessage): Promise<any> {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 10_000) throw new Error('too large');
  }
  return JSON.parse(body || '{}');
}

function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function api(req: IncomingMessage, res: ServerResponse) {
  const ip = req.socket.remoteAddress ?? '?';
  if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });
  const body = await readJson(req).catch(() => null);
  if (!body) return json(res, 400, { error: 'Bad request' });

  if (req.url === '/api/register' || req.url === '/api/login') {
    if (!limits.auth.take(`auth:${ip}`)) return json(res, 429, { error: 'Too many attempts — wait a minute and try again' });
    const username = String(body.username ?? '').trim();
    const password = String(body.password ?? '');
    if (req.url === '/api/register') {
      if (!USERNAME_RE.test(username)) return json(res, 400, { error: 'Names are 3–16 letters, numbers or underscores, starting with a letter' });
      if (!isCleanName(username)) return json(res, 400, { error: 'Please choose a different name' });
      if (password.length < 6) return json(res, 400, { error: 'Passwords need at least 6 characters' });
      if (store.userByName(username)) return json(res, 409, { error: 'That name is taken' });
      const row = createAccount(username, password);
      console.log(`[auth] new resident ${username}`);
      return json(res, 200, { token: newSession(row.id) });
    }
    const row = store.userByName(username);
    if (!row) return json(res, 401, { error: 'Wrong name or password' });
    const a = Buffer.from(hash(password, row.salt), 'hex');
    const b = Buffer.from(row.passHash, 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return json(res, 401, { error: 'Wrong name or password' });
    return json(res, 200, { token: newSession(row.id) });
  }
  if (req.url === '/api/logout') {
    if (body.token) store.deleteSession(String(body.token));
    return json(res, 200, { ok: true });
  }
  return json(res, 404, { error: 'Not found' });
}

// ---------------------------------------------------------------- static files (production build)
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json',
};

function serveStatic(req: IncomingMessage, res: ServerResponse) {
  if (!existsSync(DIST)) {
    res.writeHead(200, { 'content-type': 'text/plain' });
    return res.end('Pebble Court server is running. In development, open the Vite URL (http://localhost:5173). For production, run `npm run build` first.');
  }
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = normalize(join(DIST, url));
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  res.writeHead(200, {
    'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    'cache-control': file.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(file).pipe(res);
}

// ---------------------------------------------------------------- servers
const http = createServer((req, res) => {
  if (req.url?.startsWith('/api/')) {
    api(req, res).catch((e) => { console.error(e); json(res, 500, { error: 'Server error' }); });
    return;
  }
  serveStatic(req, res);
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
http.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '', 'http://x');
  if (url.pathname !== '/ws') return socket.destroy();
  const userId = store.sessionUser(url.searchParams.get('token') ?? '');
  const user = userId ? store.userById(userId) : null;
  if (!user) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    return socket.destroy();
  }
  wss.handleUpgrade(req, socket, head, (ws) => game.connect(ws, user));
});

// Keep-alive so idle connections behind proxies don't silently drop.
setInterval(() => {
  for (const ws of wss.clients) if (ws.readyState === ws.OPEN) ws.ping();
}, 25_000).unref();

http.listen(PORT, () => {
  console.log(`Pebble Court server on http://localhost:${PORT} ${PROD ? '(production)' : '(dev — open http://localhost:5173)'}`);
  console.log(`Database: ${DB_FILE}`);
});
