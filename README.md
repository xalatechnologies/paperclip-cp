# Paperclip Control Center

> **AI operations control plane** for managing Paperclip companies, agents, skills, secrets, VPS infrastructure, integrations, goals, roadmaps, tasks, and costs from one secure place.

---

## What is this?

Paperclip Control Center (PCC) is a dedicated orchestration and governance platform that lets you manage:

- **Companies** — Register and configure Paperclip companies (Doxis, Xala, NorChain, etc.)
- **Agents** — Create, configure, pause, resume, and monitor agents
- **Skills** — Build and version reusable SKILL.md definitions
- **Secrets** — Store API keys and tokens encrypted at rest (AES-256-GCM)
- **VPS** — Inspect and operate remote servers via SSH with a strict command safety harness
- **Monitoring** — Track heartbeats, costs, and agent status
- **Goals & Tasks** — Plan projects, milestones, and agent assignments
- **Integrations** — Connect to Slack, Teams, GitHub, Linear, and more

---

## Architecture

```
paperclip-cp/
├── apps/
│   ├── web/          # Next.js 15 dashboard (port 3000)
│   ├── api/          # Fastify REST API (port 3001)
│   ├── worker/       # BullMQ background jobs
│   └── cli/          # pcc CLI tool
│
├── packages/
│   ├── shared-types/ # TypeScript types + Zod schemas
│   ├── paperclip-sdk/ # Typed Paperclip API client
│   ├── db/           # Drizzle ORM schema + migrations
│   └── config/       # Encryption + SSH safety harness
│
├── companies/
│   └── doxis/        # Doxis company config, agents, roadmap
│
├── skills/
│   ├── bug-fixing/   # SKILL.md
│   ├── deep-review/  # SKILL.md
│   ├── context-budget-guard/ # SKILL.md
│   └── vps-ops/      # SKILL.md
│
├── docs/             # Architecture, API map, security model
└── infra/            # Docker Compose (Postgres + Redis)
```

---

## Quick Start

### 1. Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9
- Docker Desktop (for local database)

### 2. Clone and install

```bash
git clone <repo> paperclip-cp
cd paperclip-cp
pnpm install
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env with your values:
# - CONTROL_CENTER_API_KEY (any strong secret)
# - SECRETS_ENCRYPTION_KEY (run: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
# - PAPERCLIP_API_KEY (from your Paperclip dashboard)
```

### 4. Start database

```bash
docker compose -f infra/docker-compose.yml up -d
```

### 5. Run migrations

```bash
pnpm db:migrate
```

### 6. Start the platform

```bash
pnpm dev
```

- **Dashboard**: http://localhost:3000
- **API**: http://localhost:3001
- **Health check**: http://localhost:3001/health

### 7. Use the CLI

```bash
# From the workspace root:
pnpm pcc company list
pnpm pcc agent list --company doxis
pnpm pcc costs today
pnpm pcc heartbeat check
pnpm pcc secret set PAPERCLIP_API_KEY
```

---

## CLI Reference

```bash
pcc company list                           # List all companies
pcc company create doxis --name "Doxis"   # Register company
pcc company status doxis                   # Company + agents overview

pcc agent list --company doxis             # List agents
pcc agent status doxis.bug-fix-agent       # Agent detail
pcc agent pause doxis.deep-review-agent    # Pause agent
pcc agent resume doxis.deep-review-agent   # Resume agent

pcc skill list                             # List skills
pcc skill validate deep-review             # Validate skill format

pcc secret list                            # List secret names (never values)
pcc secret set PAPERCLIP_API_KEY           # Store secret securely

pcc costs today                            # Today's cost across all companies
pcc heartbeat check                        # Heartbeat status for all agents
```

---

## API Reference

All routes require `Authorization: Bearer <CONTROL_CENTER_API_KEY>` header.

```
GET  /health                                   # Health check (no auth)
GET  /api/companies                            # List companies
POST /api/companies                            # Create company
GET  /api/companies/:id                        # Company detail + agents
GET  /api/companies/:id/agents                 # Company agents
GET  /api/agents/:id                           # Agent detail + skills
POST /api/agents/:id/pause                     # Pause agent
POST /api/agents/:id/resume                    # Resume agent
PUT  /api/agents/:id/skills                    # Update skills
GET  /api/skills                               # List skills
POST /api/skills                               # Create skill
POST /api/skills/:id/validate                  # Validate skill format
GET  /api/secrets                              # List secret names (never values)
POST /api/secrets                              # Store secret (encrypted)
POST /api/secrets/:id/use                      # Retrieve secret (AUDITED)
GET  /api/costs/today                          # Today's costs
GET  /api/heartbeats/check                     # Heartbeat health check
GET  /api/servers                              # List VPS servers
POST /api/servers/:id/evaluate                 # Evaluate command safety
GET  /api/audit                                # Audit log
```

---

## Security Model

| Rule | Implementation |
|---|---|
| Secrets never in plaintext | AES-256-GCM encrypted in DB; API never returns plaintext |
| Every secret read is audited | Audit log entry on every `/secrets/:id/use` call |
| SSH allowlist | Blocked/Safe/Approval-required classification on all commands |
| API key auth | Bearer token required on all routes |
| Destructive ops blocked | Hardcoded blocklist in `@pcc/config` |

---

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| Phase 1 | Foundation, SDK, DB, API, CLI, Dashboard, Doxis bootstrap | ✅ Complete |
| Phase 2 | VPS SSH runner (live execution) | Planned |
| Phase 3 | Slack + Teams integration | Planned |
| Phase 4 | Goals, roadmaps, task manager | Planned |
| Phase 5 | Advanced monitoring, cost alerts | Planned |
| Phase 6 | Xala, NorChain company onboarding | Planned |

---

## Contributing

This is a private internal project for Doxis / AI operations.

When adding a new skill:
1. Create `skills/<slug>/SKILL.md`
2. Register via `pcc skill` CLI or POST to `/api/skills`
3. Validate with `pcc skill validate <slug>`
4. Attach to relevant agents

When adding a new company:
1. Create `companies/<slug>/company.json`
2. Register via `pcc company create <slug>`
3. Add Paperclip company ID
4. Configure agents and skills
