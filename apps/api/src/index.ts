import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Load env — walk up from cwd to find root .env
const __dirname = dirname(fileURLToPath(import.meta.url));

// Try multiple possible root locations
const candidates = [
  resolve(__dirname, '../../..'),   // apps/api/src -> root
  resolve(__dirname, '../..'),      // apps/api/src -> apps
  resolve(process.cwd(), '../..'),  // apps/api -> root (pnpm sets cwd to package dir)
  resolve(process.cwd(), '..'),     // one level up
  process.cwd(),                    // current dir
];

for (const dir of candidates) {
  config({ path: resolve(dir, '.env') });
  config({ path: resolve(dir, '.env.local'), override: false });
}

import { paperclipProxyRoutes } from './routes/paperclip.js';
import { secretsRoutes } from './routes/secret-vault.js';
import { auditRoutes, notificationsRoutes } from './routes/channels.js';
import { vpsLlmRoutes } from './routes/vps-llm.js';
import { vpsRunnerRoutes } from './routes/vps-runner.js';
import { controlRoutes } from './routes/control.js';
import { goalsRoutes } from './routes/goals.js';
import { routinesRoutes } from './routes/routines.js';
import { memoryRoutes } from './routes/memory.js';
import { knowledgeRoutes } from './routes/knowledge.js';
import { contextRoutes } from './routes/context.js';
import { authPlugin } from './plugins/auth.js';

const PORT = parseInt(process.env.API_PORT ?? '3001', 10);
const IS_DEV = process.env.NODE_ENV !== 'production';

async function buildApp() {
  const app = Fastify({
    logger: {
      level: IS_DEV ? 'info' : 'warn',
      transport: IS_DEV
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    },
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: IS_DEV
      ? ['http://localhost:3000', 'http://localhost:3030', 'http://127.0.0.1:3030']
      : (process.env.ALLOWED_ORIGINS ?? '').split(',').filter(Boolean),
    credentials: true,
  });

  await app.register(authPlugin);

  app.get('/health', async () => ({
    status: 'ok',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    paperclip: process.env.PAPERCLIP_BASE_URL ?? 'not configured',
    db: 'sqlite (.pcc/pcc.db)',
  }));

  // Paperclip API proxy
  await app.register(paperclipProxyRoutes, { prefix: '/api/paperclip' });

  // PCC-owned data (SQLite)
  await app.register(secretsRoutes,        { prefix: '/api/secrets' });
  await app.register(auditRoutes,          { prefix: '/api/audit' });
  await app.register(notificationsRoutes,  { prefix: '/api/notifications' });

  // Intelligence — goals, routines, memory, knowledge, context
  await app.register(goalsRoutes,    { prefix: '/api/goals' });
  await app.register(routinesRoutes, { prefix: '/api/routines' });
  await app.register(memoryRoutes,   { prefix: '/api/memory' });
  await app.register(knowledgeRoutes, { prefix: '/api/knowledge' });
  await app.register(contextRoutes,  { prefix: '/api/context' });

  // VPS management
  await app.register(vpsLlmRoutes,    { prefix: '/api/vps' });
  await app.register(vpsRunnerRoutes, { prefix: '/api/vps' });

  // Control plane — write access to Paperclip VPS DB
  await app.register(controlRoutes,   { prefix: '/api/control' });

  app.setNotFoundHandler((_req, reply) => {
    reply.status(404).send({ success: false, error: 'Route not found' });
  });

  app.setErrorHandler((error, _req, reply) => {
    app.log.error(error);
    reply.status(error.statusCode ?? 500).send({
      success: false,
      error: IS_DEV ? error.message : 'Internal server error',
    });
  });

  return app;
}

async function main() {
  const app = await buildApp();
  await app.listen({ port: PORT, host: '0.0.0.0' });

  console.log(`\n🚀 PCC API       → http://localhost:${PORT}`);
  console.log(`🔀 Proxy         → ${process.env.PAPERCLIP_BASE_URL ?? '⚠  PAPERCLIP_BASE_URL not set'}`);
  console.log(`🗄  Database      → SQLite (.pcc/pcc.db)`);
  console.log(`📋 Health        → http://localhost:${PORT}/health`);
  console.log(`\n   /api/paperclip/*  → Paperclip API proxy`);
  console.log(`   /api/secrets       → Encrypted vault`);
  console.log(`   /api/audit         → Audit trail`);
  console.log(`   /api/notifications → Alert channels\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
