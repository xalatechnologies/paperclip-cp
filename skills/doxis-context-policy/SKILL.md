# Doxis Paperclip Context Policy

## Status: MANDATORY — applies to ALL agents, ALL runs

## Core Principles

1. **Agents run in thin-context mode by default.**
2. **Agents receive only:** task ID, current working summary, active constraints, and relevant artifact pointers.
3. **Full documents are stored as artifacts, NEVER pasted into issue descriptions.**
4. **Every active issue maintains a compact working summary.**
5. **Every agent run updates the working summary before completion.**
6. **No more than 3-5 skills are active per run.**
7. **Opus is never default — requires explicit architecture-critical escalation.**
8. **Agents pause after repeated errors, no-progress runs, or token spikes.**
9. **Projects are mandatory for all real work.**
10. **Token usage is reviewed weekly.**

## Issue Structure (mandatory)

Every issue MUST follow this format:

```
Goal: <one sentence>
Why now: <one sentence>
Scope: <which files/modules, max 10>
Constraints: <what NOT to touch>
Acceptance criteria: <how to verify done>
Artifacts: <links to PRDs, SRSDs, logs — NOT inline content>
Working summary: <compact status, updated each run>
Next action: <one sentence>
Do not touch: <explicit exclusions>
```

## What NEVER goes into issues

- Full PRD/SRSD documents (link to artifact)
- Full git diffs (link to PR)
- Full Playwright logs (link to log file)
- Full repository file trees
- Screenshots larger than captions (link to asset)
- Chat/meeting transcripts
- Long analysis reports (store as document, link)

## Working Summary Format (mandatory on every active issue)

```
Last known state: <one sentence>
Files inspected: <list, max 10>
Decisions made: <list, max 5>
Open risks: <list, max 3>
Next exact step: <one sentence>
Do not repeat: <already-completed actions>
```

## Agent Context Mode Rules

| Agent | Default Model | Context Mode | Max Skills |
|---|---|---|---|
| CEO / Coordinator | Sonnet | Thin | 5 |
| Software Architect | Sonnet (Opus manual only) | Thin | 4 |
| Refactoring Specialist | Sonnet | Thin | 3 |
| GitHub Agent | Sonnet | Thin | 3 |
| Linear Agent | Haiku | Thin | 3 |
| QA / Playwright | Sonnet | Thin | 3 |
| Bug Fix Agent | Sonnet | Thin | 3 |
| Deep Review Agent | Sonnet | Thin | 4 |
| Doxis UI Agent | Sonnet | Thin | 3 |
| Context Curator | Haiku | Thin | 2 |

## Circuit Breaker Rules

Auto-pause agent if:
- 2 consecutive error runs
- 2 consecutive no-progress runs (no code change, no status change, no decision)
- Input tokens exceed 3x agent's historical average
- Same issue touched 3 times without status change
- Agent creates >5 comments without producing an artifact or code change

## Budget Limits

- Per-agent per-run: 500K tokens hard stop
- Company daily: 2M tokens hard stop
- Context Curator: 50K per-run hard stop (must be extremely lean)
- Any run >100K tokens: logged as warning for weekly review

## Artifact Storage Rules

| Content Type | Store Where | Put in Active Context |
|---|---|---|
| Full PRD | Document/artifact | 10-line summary + link |
| Full SRSD | Document/artifact | Relevant section pointer |
| Linear project | Linear + Paperclip | Compact milestone summary |
| Playwright logs | Log artifact | Failure summary + path |
| Screenshots | Asset | Caption + link |
| Git diff | GitHub PR | Files changed + risk summary |
| Long comments | Issue history | Last 3 comments + working summary |
| Repo analysis | Document | Architecture map summary |

## Weekly Review Checklist

Every Sunday, review:
- [ ] Total tokens by agent (flag any >200K weekly)
- [ ] Total tokens by issue (flag any >100K)
- [ ] Longest issue descriptions (flag any >2000 tokens)
- [ ] Longest comment threads (flag any >5000 tokens)
- [ ] Agents in error state
- [ ] Missing working summaries on active issues
- [ ] Mandatory skills still deployed
