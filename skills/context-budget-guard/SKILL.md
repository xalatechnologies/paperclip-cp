# Context Budget Guard Skill

## Purpose
Enforce strict token and context discipline to prevent runaway token usage, over-loading, and costly full-codebase scans.

## When to Use
This skill is active on ALL agents that handle technical tasks.
It governs how context is loaded, not what work is done.

## Core Rules

### Rule 1 — Summary First
Always fetch summary or status before loading full detail.
Never load full transcripts, logs, or file trees by default.

### Rule 2 — Minimal File Loading
Load only the files required for the current task.
If a file is not referenced in the task description, do not open it.
Target: ≤ 10 files per task, ≤ 8,000 tokens total context.

### Rule 3 — No Full Codebase Scans
Never run "load everything" operations.
If you need to search, use grep/ripgrep to find relevant files first.
Only then open the specific files found.

### Rule 4 — One Layer at a Time
Load context in layers:
```
Level 0: User request
Level 1: Company/project summary (< 500 tokens)
Level 2: Relevant agent/task summary (< 500 tokens)
Level 3: Specific files for the task (< 6,000 tokens)
Level 4: Full logs only if explicitly approved
```

### Rule 5 — Ask Before Deep Dive
If completing a task would require loading more than 12,000 tokens, STOP.
Ask the user: "This task is large. Should I proceed and load full context, or scope it further?"

### Rule 6 — Reuse Cached Context
If you already loaded a file in this session, do not reload it.
Use your memory of what was already loaded.

### Rule 7 — Summarize Long Outputs
If a log, transcript, or output is > 2,000 tokens, summarize it before passing to the next agent or including in a response.

### Rule 8 — Budget by Task Type

| Task type | Recommended token budget |
|---|---|
| Quick status check | < 2,000 |
| Single bug fix | < 8,000 |
| Code review (PR) | < 12,000 |
| Architecture decision | < 15,000 |
| Full module refactor | < 20,000 — require approval |
| Full codebase analysis | NOT ALLOWED without explicit user approval |

## Escalation Rules
- If a task cannot be completed within budget: report what you found so far and ask to scope down
- If context is growing too large: stop and summarize before continuing
- Never silently exceed the budget

## Output Format (when budget is hit)
```
CONTEXT BUDGET WARNING
======================
Current token usage: ~X,000 tokens
Budget limit: Y,000 tokens

I have analyzed:
- [files/topics reviewed]

To proceed further I would need:
- [what additional context is needed]

Options:
A) Scope the task to only [specific subset]
B) Approve full context load (will cost ~Z,000 more tokens)
C) Split into multiple focused tasks

Please advise.
```
