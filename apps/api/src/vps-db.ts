/**
 * VPS Database Helper — Persistent SSH Connection Pool
 *
 * Maintains a single persistent SSH connection to the VPS with:
 * - Auto-reconnect on failure or age expiry
 * - SSH keepalive to prevent idle disconnects
 * - Key → password → agent fallback chain
 * - Thread-safe reconnect via promise dedup
 *
 * All callers share the same connection — no per-request handshake overhead.
 */

import { NodeSSH } from 'node-ssh';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';

const VPS_HOST     = process.env.VPS_HOST     ?? '72.61.82.22';
const VPS_USER     = process.env.VPS_USER     ?? 'root';
const VPS_PASSWORD = process.env.VPS_PASSWORD;

const CONTAINER    = 'paperclip-cumf-paperclip-1';
const PG_MODULE    = '/usr/local/lib/node_modules/paperclipai/node_modules/postgres';
const PG_CONN      = `{host:"127.0.0.1",port:54329,database:"paperclip",username:"paperclip",password:"paperclip",max:1}`;

const KEEPALIVE_MS = 30_000;          // SSH keepalive interval
const MAX_CONN_AGE = 10 * 60_000;     // Reconnect after 10 minutes

// ── Connection pool ──────────────────────────────────────────────────────────

let _conn: NodeSSH | null = null;
let _connAt = 0;
let _connecting: Promise<NodeSSH> | null = null;

function findSSHKey(): string | null {
  const home = homedir();
  const candidates = [
    process.env.VPS_SSH_KEY_PATH,
    process.env.VPS_SSH_KEY,
    join(home, '.ssh', 'pcc_vps'),
    join(home, '.ssh', 'id_ed25519'),
    join(home, '.ssh', 'id_rsa'),
  ].filter(Boolean) as string[];

  for (const raw of candidates) {
    const resolved = raw.startsWith('~') ? resolve(home, raw.slice(2)) : raw;
    if (existsSync(resolved)) return resolved;
  }
  return null;
}

function dropConn() {
  if (_conn) { try { _conn.dispose(); } catch {} _conn = null; }
  _connecting = null;
}

async function connect(): Promise<NodeSSH> {
  // Dedup concurrent reconnect attempts
  if (_connecting) return _connecting;

  _connecting = (async () => {
    dropConn();
    const ssh = new NodeSSH();
    const base = { host: VPS_HOST, username: VPS_USER, keepaliveInterval: KEEPALIVE_MS };
    const keyPath = findSSHKey();

    if (keyPath) {
      try {
        await ssh.connect({ ...base, privateKeyPath: keyPath });
        _conn = ssh; _connAt = Date.now(); _connecting = null;
        console.log('[ssh] Connected via key:', keyPath);
        return ssh;
      } catch (e: any) {
        console.warn('[ssh] Key auth failed:', e.message);
      }
    }

    if (VPS_PASSWORD) {
      try {
        await ssh.connect({ ...base, password: VPS_PASSWORD });
        _conn = ssh; _connAt = Date.now(); _connecting = null;
        console.log('[ssh] Connected via password');
        return ssh;
      } catch (e: any) {
        _connecting = null;
        throw new Error(`SSH password auth failed: ${e.message}`);
      }
    }

    _connecting = null;
    throw new Error('No valid SSH credentials (set VPS_SSH_KEY_PATH or VPS_PASSWORD)');
  })();

  return _connecting;
}

async function getSSH(): Promise<NodeSSH> {
  const now = Date.now();
  if (_conn?.isConnected() && (now - _connAt) < MAX_CONN_AGE) return _conn;
  return connect();
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Execute a JavaScript function body against the Paperclip Postgres inside Docker.
 * The body receives `sql` (postgres client) as a pre-imported binding.
 *
 * @example
 *   const agents = await vpsQuery<Agent[]>(`
 *     const rows = await sql\`SELECT * FROM agents LIMIT 10\`;
 *     return rows;
 *   `);
 */
export async function vpsQuery<T = unknown>(queryBody: string): Promise<T> {
  const script = `
const postgres = require("${PG_MODULE}");
const sql = postgres(${PG_CONN});
async function __run() { ${queryBody} }
__run()
  .then(r => { console.log(JSON.stringify(r ?? null)); return sql.end(); })
  .catch(e => { console.error("VPS_QUERY_ERROR:" + e.message); sql.end().catch(()=>{}); process.exit(1); });
`;

  let ssh: NodeSSH;
  try {
    ssh = await getSSH();
  } catch (err: any) {
    throw new Error(`SSH connect failed: ${err.message}`);
  }

  const tmpFile = `/tmp/pcc_${Date.now()}_${Math.random().toString(36).slice(2)}.js`;

  try {
    // Write script to VPS temp file
    await ssh.execCommand(`cat > ${tmpFile} << 'JSEOF'\n${script}\nJSEOF`);

    const { stdout, stderr } = await ssh.execCommand(
      `docker cp ${tmpFile} ${CONTAINER}:${tmpFile} && ` +
      `docker exec ${CONTAINER} node ${tmpFile} 2>&1; ` +
      `rm -f ${tmpFile}`
    );

    if (stderr?.includes('VPS_QUERY_ERROR:')) {
      throw new Error(stderr.split('VPS_QUERY_ERROR:')[1]?.trim() ?? stderr);
    }

    const lines = (stdout ?? '').trim().split('\n');
    const jsonLine = lines[lines.length - 1];
    return JSON.parse(jsonLine) as T;
  } catch (err: any) {
    // Drop connection on exec failure — next call will reconnect
    dropConn();
    throw err;
  }
}

/** Convenience alias — for DML (INSERT/UPDATE/DELETE) */
export async function vpsExec(queryBody: string): Promise<unknown> {
  return vpsQuery(queryBody);
}

/**
 * Execute a raw shell command on the VPS host (not inside Docker).
 * Used for compose operations, docker commands, file management.
 */
export async function vpsCommand(command: string): Promise<{ stdout: string; stderr: string }> {
  let ssh: NodeSSH;
  try {
    ssh = await getSSH();
  } catch (err: any) {
    throw new Error(`SSH connect failed: ${err.message}`);
  }

  try {
    const { stdout, stderr } = await ssh.execCommand(command);
    return { stdout: stdout ?? '', stderr: stderr ?? '' };
  } catch (err: any) {
    dropConn();
    throw err;
  }
}

/** Gracefully close the persistent connection (call on API shutdown) */
export function disposeSSH(): void {
  dropConn();
  console.log('[ssh] Connection pool disposed');
}

/** Ping the VPS — returns true if reachable */
export async function pingVPS(): Promise<boolean> {
  try {
    const { stdout } = await vpsCommand('echo pong');
    return stdout.trim() === 'pong';
  } catch {
    return false;
  }
}
