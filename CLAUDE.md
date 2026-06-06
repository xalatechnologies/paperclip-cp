# Paperclip Control Center — AI Agent Guide

## Project Purpose

**Paperclip Control Center (PCC)** is the dedicated AI operations control plane for managing Paperclip-powered companies, agents, skills, secrets, infrastructure, goals, and roadmaps from one place.

It is the **AI operations layer** for Doxis Engineering Studio and future companies (Xala, NorChain). It is not a chat tool — it is a command-and-control system: dashboard-driven, CLI-driven, and integration-driven.

---

## Long-Term Goals

### Phase 1 (current) — Foundation
- Monorepo with Fastify API, Next.js dashboard, CLI, and Convex backend
- Register companies, agents, skills, and secrets
- Heartbeat monitoring and cost tracking
- Encrypted secrets vault (AES-256-GCM)
- Doxis company bootstrapped with 4 agents and 4 skills

### Phase 2 — Live VPS Operations
- SSH runner: execute safe commands on VPS servers with a strict allowlist
- `pcc server exec doxis-vps "docker ps"` CLI command
- Full audit trail of every command run

### Phase 3 — Integrations
- Slack: alerts, agent status, cost summaries posted to channels
- Microsoft Teams: same as Slack
- GitHub: link tasks to PRs, auto-close tasks when PRs merge
- Linear: sync tasks bidirectionally

### Phase 4 — Goals & Roadmaps
- Full milestone/task management inside PCC
- Agent task assignment with progress tracking
- Roadmap views per company

### Phase 5 — Advanced Monitoring
- Cost alerts (daily budget thresholds per company/agent)
- Heartbeat anomaly detection
- Token usage trends and forecasting

### Phase 6 — Multi-Company Expansion
- Onboard Xala and NorChain as managed companies
- Per-company budget isolation and reporting
- Multi-tenant secrets scoping

---

## Stack

| Layer | Technology |
|---|---|
| Database | **Convex** (real-time, cloud-hosted, no migrations) |
| API | **Fastify** (Node.js, TypeScript, Bearer auth) |
| Web UI | **Next.js 15** (App Router, Convex real-time hooks) |
| CLI | **Commander.js** (`pcc` command) |
| Background jobs | **Convex scheduled functions** (crons, no Redis) |
| Secrets | **AES-256-GCM** encrypted at rest in Convex |
| Paperclip SDK | Custom typed HTTP client (`packages/paperclip-sdk`) |

---

## Key Architecture Decisions

- **Convex replaces PostgreSQL + Redis + BullMQ** — no Docker needed for dev
- **Secrets are NEVER returned in plaintext by queries** — only via `POST /api/secrets/:id/use` (audited)
- **All destructive SSH commands are blocked** — hardcoded blocklist in `packages/config`
- **Skills are SKILL.md files** — stored in `skills/` and registered in Convex DB
- **Companies live in `companies/<slug>/company.json`** — the source of truth for bootstrapping

---

## Convex Guidelines

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

## Environment Setup

```bash
# 1. Install
pnpm install

# 2. Start Convex (keep running in one terminal)
npx convex dev

# 3. Start API + web (in another terminal)
pnpm dev

# 4. CLI usage
pnpm pcc company list
pnpm pcc heartbeat check
pnpm pcc costs today
```

Key env vars (in `.env` and `.env.local`):
- `CONVEX_URL` / `NEXT_PUBLIC_CONVEX_URL` — from `.env.local` (set by `npx convex dev`)
- `PAPERCLIP_API_KEY` — the Paperclip Bearer token
- `PAPERCLIP_BASE_URL` — `https://paperclip-cumf.srv1212925.hstgr.cloud`
- `SECRETS_ENCRYPTION_KEY` — 64-char hex, AES-256 key
- `CONTROL_CENTER_API_KEY` — Bearer token for the Fastify API

---

## Managed Companies

| Company | Status | Paperclip ID |
|---|---|---|
| Doxis Engineering Studio | Active (bootstrapping) | Set via Paperclip dashboard |
| Xala | Planned Phase 6 | — |
| NorChain | Planned Phase 6 | — |

## Agent Fleet (Doxis)

| Agent | Role | Skills |
|---|---|---|
| Engineering Lead | Orchestrates tasks, reviews plans | context-budget-guard, deep-review |
| Bug Fix Agent | Fixes bugs with minimal scope | bug-fixing, context-budget-guard |
| Deep Review Agent | Multi-pass code review | deep-review, context-budget-guard |
| QA Release Agent | Release readiness validation | context-budget-guard |

---

## Convex Dashboard

Project: `paperclip-cp`
Dashboard: https://dashboard.convex.dev/t/ibrahim-rahmani-52c34/paperclip-cp
Deployment: `blessed-bandicoot-99` (EU West — Ireland)
