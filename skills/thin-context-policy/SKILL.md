# Thin Context Policy

## Purpose
Enforce minimal, scoped context loading on every agent run. Prevent bootstrap bloat, repeated full-history injection, and unnecessary codebase scanning.

## When to Use
This policy is mandatory on ALL agents, ALL runs, ALL companies.

## Core Rules

### Rule 1 — Start From Five Things Only
Every run must begin from exactly this context:
1. Current issue goal (one sentence)
2. Compact working summary (< 500 tokens)
3. Current next action (one sentence)
4. Relevant file list (max 10 files)
5. Active constraints (what NOT to do)

### Rule 2 — Never Reload Full History
Do not load full issue comment threads.
Do not load full conversation transcripts.
Do not load full PRD documents.
If you need history, load only the last 3 comments or the issue summary.

### Rule 3 — Skills Are Not Free
Load only the skills required for THIS specific task.
Never load all company skills on every run.
Maximum 3-5 skills per run.

### Rule 4 — No Repository Maps
Do not generate or load full repository file trees.
If you need to find a file, use grep/search with a specific query.
Never run `find . -type f` or equivalent.

### Rule 5 — Fetch, Don't Guess
If context is missing, fetch the smallest necessary artifact.
Do not guess, hallucinate, or load everything "just in case".
Ask: "What is the ONE file I need to read right now?"

### Rule 6 — Working Summary Format
Every long-running issue must maintain this summary:
```
Last known state: <one sentence>
Files inspected: <list, max 10>
Decisions made: <list, max 5>
Open risks: <list, max 3>
Next exact step: <one sentence>
Do not repeat: <list of already-completed actions>
```

### Rule 7 — Issue Structure
Every issue must follow this format:
```
Goal: <what to achieve>
Scope: <which files/modules>
Relevant files: <max 10>
Constraints: <what NOT to touch>
Acceptance criteria: <how to verify>
Do not touch: <explicit exclusions>
```
Do not paste logs, analysis files, chat transcripts, or full PRDs into issues.
Store those as documents and reference them by name.

### Rule 8 — Output Discipline
Do not over-document.
Do not write multi-page explanations for simple changes.
Do not create unnecessary files (READMEs, CHANGELOGs, etc.) unless explicitly requested.
Commit messages: one line. PR descriptions: max 10 lines.

### Rule 9 — No Speculative Work
Do not refactor code that is not broken.
Do not add tests for code you did not change.
Do not "improve" things that were not in the task.
If the task says "fix the typo", fix the typo. Nothing else.

### Rule 10 — Circuit Breaker
If you have made 3 attempts at the same step without progress, STOP.
Report what you tried, what failed, and ask for guidance.
Do not retry indefinitely. Do not try "one more approach".

## Budget Enforcement
- Quick fix: < 5,000 input tokens
- Standard task: < 20,000 input tokens
- Complex task: < 50,000 input tokens — requires explicit approval
- Anything above 100,000: BLOCKED — escalate to human

## Escalation
If a task requires more context than allowed:
1. Report what you have so far
2. State exactly what additional context you need
3. Wait for approval before loading more
