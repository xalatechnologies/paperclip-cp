<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

---

# Paperclip Control Center — Agent Context

## What This Project Is

**Paperclip Control Center (PCC)** is the AI operations control plane for companies using Paperclip AI agents. It is a multi-app monorepo that lets you:

- Register and manage **Paperclip companies** (Doxis, Xala, NorChain)
- Configure and monitor **AI agents** (status, heartbeat, skills, costs)
- Store and inject **encrypted secrets** (AES-256-GCM, never in plaintext)
- Plan **goals, milestones, and tasks** and assign them to agents
- Operate **VPS servers** via SSH with a strict safety harness
- View all of this via a **real-time web dashboard** or **CLI** (`pcc`)

This is not a chat tool. It is a control plane: dashboard-driven, CLI-driven, integration-driven.

---

## Long-Term Vision

| Phase | Goal | Status |
|---|---|---|
| 1 | Foundation: API, dashboard, CLI, Convex DB, Doxis agents | 🔄 In progress |
| 2 | Live VPS SSH runner with command allowlist | Planned |
| 3 | Slack + Teams + GitHub + Linear integrations | Planned |
| 4 | Full goals/roadmap/task manager | Planned |
| 5 | Cost alerts, anomaly detection, forecasting | Planned |
| 6 | Onboard Xala, NorChain | Planned |

---

## Monorepo Structure

```
paperclip-cp/
├── apps/
│   ├── api/          # Fastify REST API (port 3001) — Bearer auth
│   ├── web/          # Next.js 15 dashboard (port 3000) — real-time via Convex
│   ├── cli/          # pcc CLI (Commander.js)
│   └── worker/       # Placeholder — jobs run as Convex cron functions
│
├── packages/
│   ├── shared-types/ # Zod schemas + TypeScript types
│   ├── paperclip-sdk/# Typed HTTP client for the Paperclip API
│   └── config/       # AES-256 encryption + SSH command safety harness
│
├── convex/           # ALL database logic lives here
│   ├── schema.ts     # Single source of truth for all tables
│   ├── companies.ts  # Company queries + mutations
│   ├── agents.ts     # Agent CRUD, heartbeat check, status snapshots
│   ├── skills.ts     # Skill registry CRUD + validation
│   ├── secrets.ts    # Encrypted secret storage + audit log
│   ├── operations.ts # Costs, servers, goals, tasks, heartbeats
│   ├── crons.ts      # Scheduled polling (replaces Redis + BullMQ)
│   └── jobs.ts       # Paperclip API polling actions
│
├── skills/           # SKILL.md definitions
│   ├── bug-fixing/
│   ├── deep-review/
│   ├── context-budget-guard/
│   └── vps-ops/
│
└── companies/
    └── doxis/        # company.json + roadmap.md
```

---

## Critical Rules for AI Agents Working Here

### Database
- **All DB operations go through `convex/`** — never write direct DB calls elsewhere
- Use `useQuery` / `useMutation` in Next.js client components for real-time updates
- Use `ConvexHttpClient` in Fastify API routes (see `apps/api/src/convex-client.ts`)
- Schema is in `convex/schema.ts` — always check it before adding mutations

### Secrets
- **Never return `encryptedValue` from queries to the client** — the `secrets.list` query strips it
- Only `secrets.getEncrypted` returns it, and only the Fastify API calls that
- Every secret read via `/api/secrets/:id/use` is audit-logged — this is mandatory

### SSH / VPS
- **All commands must pass through `evaluateCommand()` in `packages/config`**
- Blocked commands include: `rm -rf`, `drop database`, `chmod 777`, `curl | bash`, etc.
- Commands requiring approval are paused and never run silently

### Skills
- Skills are SKILL.md files stored in `skills/<slug>/SKILL.md`
- They must be registered in Convex via `POST /api/skills` or the CLI
- Token estimate is auto-calculated: `content.length / 4`

### Environment Variables
- `CONVEX_URL` — set in `.env.local` by `npx convex dev`
- `PAPERCLIP_API_KEY` + `PAPERCLIP_BASE_URL` — set in Convex dashboard via `npx convex env set`
- `SECRETS_ENCRYPTION_KEY` — AES-256 key in `.env`, never in Convex

---

## Active Companies

### Doxis Engineering Studio
- **Goal**: Reduce regression risk and improve maintainability in SmartForms module
- **Agents**: Engineering Lead, Bug Fix Agent, Deep Review Agent, QA Release Agent
- **Skills**: context-budget-guard, bug-fixing, deep-review
- **Config**: `companies/doxis/company.json`

---

## Convex Project
- **Dashboard**: https://dashboard.convex.dev/t/ibrahim-rahmani-52c34/paperclip-cp
- **Deployment**: `blessed-bandicoot-99` (EU West — Ireland)
- **URL**: `https://blessed-bandicoot-99.eu-west-1.convex.cloud`
