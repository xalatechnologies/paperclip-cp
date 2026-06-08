/**
 * Runtime Config — reads from Convex environment variables
 *
 * All non-bootstrap secrets are stored here via `npx convex env set`.
 * The Fastify API fetches this at startup via convexAdmin.query(internal.config.get)
 * and injects values into process.env before any route handler runs.
 *
 * Set values with:
 *   npx convex env set PAPERCLIP_API_KEY=...
 *   npx convex env set OPENAI_API_KEY=...
 *   etc.
 *
 * View current values:
 *   npx convex env list
 */

import { internalQuery } from "./_generated/server";

export const get = internalQuery({
  args: {},
  handler: async () => {
    // Convex functions read env vars from process.env
    // Values are set via `npx convex env set KEY=VALUE`
    return {
      // ── Paperclip API ────────────────────────────────────────────────────
      PAPERCLIP_API_KEY:            process.env.PAPERCLIP_API_KEY,
      PAPERCLIP_BASE_URL:           process.env.PAPERCLIP_BASE_URL,
      PAPERCLIP_EMAIL:              process.env.PAPERCLIP_EMAIL,
      PAPERCLIP_PASSWORD:           process.env.PAPERCLIP_PASSWORD,
      PAPERCLIP_AGENT_JWT_SECRET:   process.env.PAPERCLIP_AGENT_JWT_SECRET,

      // ── Company IDs ──────────────────────────────────────────────────────
      DOXIS_COMPANY_ID:             process.env.DOXIS_COMPANY_ID,
      DOXIS_ISSUE_PREFIX:           process.env.DOXIS_ISSUE_PREFIX,
      FULLSTACK_COMPANY_ID:         process.env.FULLSTACK_COMPANY_ID,
      FULLSTACK_ISSUE_PREFIX:       process.env.FULLSTACK_ISSUE_PREFIX,
      XALA_COMPANY_ID:              process.env.XALA_COMPANY_ID,
      XALA_ISSUE_PREFIX:            process.env.XALA_ISSUE_PREFIX,

      // ── VPS / SSH ────────────────────────────────────────────────────────
      VPS_HOST:                     process.env.VPS_HOST,
      VPS_IP:                       process.env.VPS_IP,
      VPS_USER:                     process.env.VPS_USER,
      VPS_PASSWORD:                 process.env.VPS_PASSWORD,
      VPS_SSH_KEY_PATH:             process.env.VPS_SSH_KEY_PATH,
      VPS_COMPOSE_DIR:              process.env.VPS_COMPOSE_DIR,
      VPS_API_BASE:                 process.env.VPS_API_BASE,
      VPS_API_KEY:                  process.env.VPS_API_KEY,

      // ── AI / LLM ─────────────────────────────────────────────────────────
      OPENAI_API_KEY:               process.env.OPENAI_API_KEY,

      // ── Integrations ─────────────────────────────────────────────────────
      LINEAR_API_KEY:               process.env.LINEAR_API_KEY,
      GH_TOKEN:                     process.env.GH_TOKEN,
      GITHUB_USER:                  process.env.GITHUB_USER,
    };
  },
});
