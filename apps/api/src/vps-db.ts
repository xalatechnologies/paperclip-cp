/**
 * VPS Database Helper
 * 
 * Executes queries against the Paperclip Postgres database on the VPS
 * via SSH + node script execution inside the Docker container.
 * 
 * This is the primary write channel for PCC → Paperclip control.
 */

import { NodeSSH } from 'node-ssh';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';

const VPS_HOST = process.env.VPS_HOST ?? '72.61.82.22';
const VPS_USER = process.env.VPS_USER ?? 'root';
const VPS_PASSWORD = process.env.VPS_PASSWORD;
const CONTAINER = 'paperclip-cumf-paperclip-1';
const PG_MODULE = '/usr/local/lib/node_modules/paperclipai/node_modules/postgres';
const PG_CONN = `{host:"127.0.0.1", port:54329, database:"paperclip", username:"paperclip", password:"paperclip", max:1}`;

function findSSHKey(): string | null {
  const home = homedir();
  const candidates = [
    process.env.VPS_SSH_KEY_PATH,
    process.env.VPS_SSH_KEY,
    join(home, '.ssh', 'id_ed25519'),
    join(home, '.ssh', 'id_rsa'),
    join(home, '.ssh', 'pcc_vps'),
  ].filter(Boolean) as string[];

  for (const raw of candidates) {
    const resolved = raw.startsWith('~') ? resolve(home, raw.slice(2)) : raw;
    if (existsSync(resolved)) return resolved;
  }
  return null;
}

async function getSSH(): Promise<NodeSSH> {
  const ssh = new NodeSSH();
  const keyPath = findSSHKey();

  if (keyPath) {
    try {
      await ssh.connect({ host: VPS_HOST, username: VPS_USER, privateKeyPath: keyPath });
      return ssh;
    } catch { /* try next */ }
  }

  const agentSock = process.env.SSH_AUTH_SOCK;
  if (agentSock) {
    try {
      await ssh.connect({ host: VPS_HOST, username: VPS_USER, agent: agentSock });
      return ssh;
    } catch { /* try password */ }
  }

  if (VPS_PASSWORD) {
    await ssh.connect({ host: VPS_HOST, username: VPS_USER, password: VPS_PASSWORD });
    return ssh;
  }

  throw new Error('No valid SSH credentials for VPS');
}

/**
 * Execute a JavaScript function body against the Paperclip Postgres.
 * The function receives `sql` (postgres client) as a parameter.
 * Must return a JSON-serializable value.
 * 
 * Example:
 *   const result = await vpsQuery(`
 *     const rows = await sql\`SELECT * FROM agents LIMIT 5\`;
 *     return rows;
 *   `);
 */
export async function vpsQuery<T = unknown>(queryBody: string): Promise<T> {
  const script = `
const postgres = require("${PG_MODULE}");
const sql = postgres(${PG_CONN});
async function __run() {
  ${queryBody}
}
__run()
  .then(result => { console.log(JSON.stringify(result ?? null)); return sql.end(); })
  .catch(e => { console.error("VPS_QUERY_ERROR:" + e.message); sql.end().catch(()=>{}); process.exit(1); });
`;

  const ssh = await getSSH();
  try {
    // Write script to temp file on host, copy into container, execute
    const tmpFile = `/tmp/pcc_query_${Date.now()}.js`;
    await ssh.execCommand(`cat > ${tmpFile} << 'JSEOF'\n${script}\nJSEOF`);
    const { stdout, stderr } = await ssh.execCommand(
      `docker cp ${tmpFile} ${CONTAINER}:${tmpFile} && docker exec ${CONTAINER} node ${tmpFile} 2>&1 && rm -f ${tmpFile}`
    );

    if (stderr && stderr.includes('VPS_QUERY_ERROR:')) {
      const msg = stderr.split('VPS_QUERY_ERROR:')[1]?.trim() ?? stderr;
      throw new Error(msg);
    }

    // Parse the last line as JSON (stdout may have other output before it)
    const lines = (stdout ?? '').trim().split('\n');
    const jsonLine = lines[lines.length - 1];
    return JSON.parse(jsonLine) as T;
  } finally {
    ssh.dispose();
  }
}

/**
 * Execute a write operation (INSERT/UPDATE/DELETE).
 * Returns the number of affected rows or the result.
 */
export async function vpsExec(queryBody: string): Promise<unknown> {
  return vpsQuery(queryBody);
}

/**
 * Execute a raw SSH command on the VPS host.
 */
export async function vpsCommand(command: string): Promise<{ stdout: string; stderr: string }> {
  const ssh = await getSSH();
  try {
    const result = await ssh.execCommand(command);
    return { stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
  } finally {
    ssh.dispose();
  }
}
