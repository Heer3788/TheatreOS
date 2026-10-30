import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { createApp, createDemoState } from './core.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const env = process.env;
if (!/^\d{6}$/.test(env.MANAGER_PIN || '') || !/^\d{6}$/.test(env.EMPLOYEE_PIN || '') || env.MANAGER_PIN === env.EMPLOYEE_PIN || (env.SESSION_SECRET || '').length < 32) {
  throw new Error('Set distinct six-digit MANAGER_PIN and EMPLOYEE_PIN values and a SESSION_SECRET of at least 32 characters.');
}

class FileStore {
  constructor(path) { this.path = path; this.queue = Promise.resolve(); }
  async init() {
    await mkdir(dirname(this.path), { recursive: true });
    try { await readFile(this.path); } catch { await writeFile(this.path, JSON.stringify(createDemoState(), null, 2)); }
  }
  async read() { return JSON.parse(await readFile(this.path, 'utf8')); }
  async update(fn) {
    const task = this.queue.then(async () => {
      const state = await this.read();
      const result = await fn(state);
      const temporary = `${this.path}.tmp`;
      await writeFile(temporary, JSON.stringify(state, null, 2));
      await rename(temporary, this.path);
      return result;
    });
    this.queue = task.catch(() => {});
    return task;
  }
}

class PostgresStore {
  constructor(pool) { this.pool = pool; }
  async init() {
    await this.pool.query('CREATE TABLE IF NOT EXISTS theatreos_state (id INTEGER PRIMARY KEY, value JSONB NOT NULL)');
    await this.pool.query('INSERT INTO theatreos_state (id, value) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING', [JSON.stringify(createDemoState())]);
  }
  async read() {
    const result = await this.pool.query('SELECT value FROM theatreos_state WHERE id = 1');
    return result.rows[0].value;
  }
  async update(fn) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query('SELECT value FROM theatreos_state WHERE id = 1 FOR UPDATE');
      const state = current.rows[0].value;
      const result = await fn(state);
      await client.query('UPDATE theatreos_state SET value = $1::jsonb WHERE id = 1', [JSON.stringify(state)]);
      await client.query('COMMIT');
      return result;
    } catch (cause) {
      await client.query('ROLLBACK');
      throw cause;
    } finally { client.release(); }
  }
}

let store;
if (env.DATABASE_URL) {
  const { Pool } = await import('pg');
  store = new PostgresStore(new Pool({ connectionString: env.DATABASE_URL }));
} else {
  store = new FileStore(resolve(root, env.DATA_FILE || 'data/state.json'));
}
await store.init();
const [html, css, i18n, js] = await Promise.all(['index.html', 'styles.css', 'i18n.js', 'app.js'].map(file => readFile(resolve(root, 'app', file), 'utf8')));
const sampleFile = resolve(root, env.SAMPLE_INSIGHTS_FILE || 'data/analytics/export/sample-records.json');
async function loadSampleInsights() {
  try { return JSON.parse(await readFile(sampleFile, 'utf8')); }
  catch (cause) { if (cause.code === 'ENOENT') return null; throw cause; }
}
const app = createApp({ store, assets: { html, css, i18n, js }, env, loadSampleInsights });
const server = createServer(async (incoming, outgoing) => {
  try {
    const protocol = String(incoming.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
    const url = `${protocol}://${incoming.headers.host}${incoming.url}`;
    const method = incoming.method || 'GET';
    const request = new Request(url, { method, headers: incoming.headers, body: method === 'GET' || method === 'HEAD' ? undefined : Readable.toWeb(incoming), duplex: 'half' });
    const response = await app(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (method !== 'HEAD' && response.body) Readable.fromWeb(response.body).pipe(outgoing); else outgoing.end();
  } catch (cause) {
    console.error(cause);
    outgoing.writeHead(500, { 'content-type': 'text/plain' });
    outgoing.end('Server error');
  }
});
const port = Number(env.PORT || 3000);
server.listen(port, '0.0.0.0', () => console.log(`TheatreOS listening on port ${port} (${env.DATABASE_URL ? 'Postgres' : 'local demo file'})`));
