# Idempotent Execution Guard

## Status: MANDATORY — applies to ALL agents

## Rule

Before doing ANY work on an issue, check if the work was already done.

## Pre-flight checks (do these FIRST, before any action)

1. **Read existing comments** on the issue. If a comment already contains the deliverable (summary, report, analysis), do NOT re-create it.
2. **Check issue status.** If the issue is already `done`, do NOT reopen or re-execute. Post a one-line confirmation and exit.
3. **Check child issues.** If you created child issues in a previous run, do NOT create duplicates. Check by title match.
4. **Check for your own recent comments.** If you posted a comment within the last 10 minutes with the same intent, do NOT post again.

## When you detect prior work

- If deliverable exists: post "✓ Work already completed in previous run. No action needed." and exit.
- If child issue exists: post "✓ Child issue already created: [identifier]" and exit.
- If issue is done: do nothing, exit immediately.

## Anti-duplicate rules

- Never post the same summary twice on the same issue.
- Never create a child issue with the same title as an existing child.
- Never re-fetch data you already fetched and posted.
- If retrying after a failure, check what succeeded before re-executing.

## Output limit

- If this is a retry run and prior work exists, your output must be under 100 tokens.
- Do NOT re-do work just because the previous run was marked as failed.
