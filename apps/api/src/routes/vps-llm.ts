/**
 * VPS LLM Configuration Route
 * 
 * Manages LLM provider credentials on the Paperclip VPS:
 * - GET  /api/vps/llm-status     → current LLM config status (no secrets returned)
 * - POST /api/vps/llm-config     → write LLM keys to VPS .env + restart container
 * - POST /api/vps/agent-models   → update adapter_config.model for codex_local agents
 */

import type { FastifyPluginAsync } from 'fastify';
import { NodeSSH } from 'node-ssh';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';

const VPS_HOST = process.env.VPS_HOST ?? '72.61.82.22';
const VPS_USER = process.env.VPS_USER ?? 'root';
const VPS_PASSWORD = process.env.VPS_PASSWORD;
const COMPOSE_DIR = '/docker/paperclip-cumf';
const ENV_FILE = `${COMPOSE_DIR}/.env`;

function findSSHKey(): string | null {
  const home = homedir();
  const candidates = [
    // Configured paths
    process.env.VPS_SSH_KEY_PATH,
    process.env.VPS_SSH_KEY,
    // Common default keys
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

async function getSSH() {
  const ssh = new NodeSSH();
  const keyPath = findSSHKey();

  // 1. Try SSH key
  if (keyPath) {
    try {
      await ssh.connect({ host: VPS_HOST, username: VPS_USER, privateKeyPath: keyPath });
      return ssh;
    } catch {
      // Key failed, try next method
    }
  }

  // 2. Try SSH agent (how terminal SSH connects)
  const agentSock = process.env.SSH_AUTH_SOCK;
  if (agentSock) {
    try {
      await ssh.connect({ host: VPS_HOST, username: VPS_USER, agent: agentSock });
      return ssh;
    } catch {
      // Agent failed, try password
    }
  }

  // 3. Fall back to password
  if (VPS_PASSWORD) {
    await ssh.connect({ host: VPS_HOST, username: VPS_USER, password: VPS_PASSWORD });
    return ssh;
  }

  throw new Error('No valid SSH key, agent, or password configured for VPS');
}

export const vpsLlmRoutes: FastifyPluginAsync = async (app) => {

  // GET /api/vps/llm-status — returns which providers are configured (no values)
  app.get('/llm-status', async (_req, reply) => {
    try {
      const ssh = await getSSH();
      const { stdout } = await ssh.execCommand(`cat ${ENV_FILE} 2>/dev/null`);
      ssh.dispose();

      const lines = (stdout ?? '').split('\n');
      const has = (key: string) => lines.some(l => {
        const trimmed = l.trim();
        return trimmed.startsWith(key + '=') && trimmed.split('=').slice(1).join('=').trim().length > 0;
      });
      const get = (key: string) =>
        lines.find(l => l.startsWith(key + '='))?.split('=').slice(1).join('=') ?? null;

      return reply.send({
        openai: {
          configured: has('OPENAI_API_KEY'),
          baseUrl: get('OPENAI_BASE_URL'),
          model: get('CODEX_DEFAULT_MODEL') ?? 'gpt-5.3-codex',
        },
        anthropic: {
          configured: has('ANTHROPIC_API_KEY'),
        },
        zai: {
          configured: has('OPENAI_BASE_URL') && 
            (lines.find(l => l.startsWith('OPENAI_BASE_URL='))?.includes('z.ai') ?? false),
        },
      });
    } catch (err: any) {
      return reply.status(503).send({ error: 'VPS unreachable', detail: err.message });
    }
  });

  // POST /api/vps/llm-config — apply LLM credentials to VPS and restart
  app.post<{
    Body: {
      openaiApiKey?: string;
      openaiBaseUrl?: string;
      openaiModel?: string;
      anthropicApiKey?: string;
      glmApiKey?: string;
      glmBaseUrl?: string;
      glmModel?: string;
      restart?: boolean;
    }
  }>('/llm-config', async (req, reply) => {
    const {
      openaiApiKey, openaiBaseUrl, openaiModel,
      anthropicApiKey,
      glmApiKey, glmBaseUrl, glmModel,
      restart = true,
    } = req.body;

    if (!openaiApiKey && !anthropicApiKey && !glmApiKey) {
      return reply.status(400).send({ error: 'Provide at least one API key (openaiApiKey, anthropicApiKey, or glmApiKey)' });
    }

    try {
      const ssh = await getSSH();

      // Read current .env
      const { stdout: currentEnv } = await ssh.execCommand(`cat ${ENV_FILE} 2>/dev/null`);
      let envLines = (currentEnv ?? '').split('\n');

      // Helper to upsert a key
      const upsert = (key: string, value: string) => {
        const idx = envLines.findIndex(l => l.startsWith(key + '='));
        if (idx >= 0) {
          envLines[idx] = `${key}=${value}`;
        } else {
          envLines.push(`${key}=${value}`);
        }
      };

      if (openaiApiKey) {
        upsert('OPENAI_API_KEY', openaiApiKey);
        if (openaiBaseUrl) {
          upsert('OPENAI_BASE_URL', openaiBaseUrl);
        }
        if (openaiModel) {
          upsert('CODEX_DEFAULT_MODEL', openaiModel);
        }
      }

      if (anthropicApiKey) {
        upsert('ANTHROPIC_API_KEY', anthropicApiKey);
      }

      if (glmApiKey) {
        upsert('GLM_API_KEY', glmApiKey);
        upsert('GLM_BASE_URL', glmBaseUrl ?? 'https://open.bigmodel.cn/api/paas/v4');
        upsert('GLM_MODEL', glmModel ?? 'glm-5.1');
      }

      // Write back
      const newEnv = envLines.filter(l => l.trim() !== '').join('\n') + '\n';
      await ssh.execCommand(`cat > ${ENV_FILE} << 'ENVEOF'\n${newEnv}\nENVEOF`);

      // Restart the container
      if (restart) {
        const { stdout: restartOut, stderr: restartErr } = await ssh.execCommand(
          `cd ${COMPOSE_DIR} && docker compose up -d --no-build 2>&1`
        );
        ssh.dispose();
        return reply.send({
          success: true,
          applied: {
            openai: !!openaiApiKey,
            openaiBaseUrl: openaiBaseUrl ?? null,
            anthropic: !!anthropicApiKey,
            glm: !!glmApiKey,
          },
          restart: restartOut || restartErr,
        });
      }

      ssh.dispose();
      return reply.send({ success: true, restart: 'skipped' });

    } catch (err: any) {
      return reply.status(503).send({ error: 'VPS unreachable or write failed', detail: err.message });
    }
  });

  // POST /api/vps/agent-models — update model name in adapter_config for all codex_local agents
  app.post<{
    Body: {
      model: string; // e.g. 'glm-5.1'
      companyPrefix?: string; // e.g. 'DOX' — if omitted, updates all companies
    }
  }>('/agent-models', async (req, reply) => {
    const { model, companyPrefix } = req.body;

    if (!model) return reply.status(400).send({ error: 'model is required' });

    try {
      const ssh = await getSSH();

      const nodeScript = `
const postgres = require('/usr/local/lib/node_modules/paperclipai/node_modules/postgres');
const sql = postgres({host:'127.0.0.1', port:54329, database:'paperclip', username:'paperclip', password:'paperclip', max:1});
async function main() {
  const companyFilter = ${companyPrefix ? `'${companyPrefix}'` : 'null'};
  let agents;
  if (companyFilter) {
    agents = await sql\`
      SELECT a.id, a.name, a.adapter_config
      FROM agents a
      JOIN companies c ON c.id = a.company_id
      WHERE a.adapter_type = 'codex_local' AND c.issue_prefix = \${companyFilter}
    \`;
  } else {
    agents = await sql\`SELECT id, name, adapter_config FROM agents WHERE adapter_type = 'codex_local'\`;
  }
  
  let updated = 0;
  for (const a of agents) {
    const cfg = { ...a.adapter_config, model: '${model}' };
    await sql\`UPDATE agents SET adapter_config = \${sql.json(cfg)}, updated_at = NOW() WHERE id = \${a.id}\`;
    console.log('Updated:', a.name, '->', '${model}');
    updated++;
  }
  console.log('Total updated:', updated);
  await sql.end();
}
main().catch(e => { console.error(e.message); sql.end().catch(()=>{}); process.exit(1); });
`;

      await ssh.execCommand(`cat > /tmp/update_models.js << 'JSEOF'\n${nodeScript}\nJSEOF`);
      const { stdout, stderr } = await ssh.execCommand(
        'docker cp /tmp/update_models.js paperclip-cumf-paperclip-1:/tmp/update_models.js && docker exec paperclip-cumf-paperclip-1 node /tmp/update_models.js 2>&1'
      );
      ssh.dispose();

      return reply.send({
        success: !stderr,
        model,
        output: stdout || stderr,
      });

    } catch (err: any) {
      return reply.status(503).send({ error: 'Failed', detail: err.message });
    }
  });
};
