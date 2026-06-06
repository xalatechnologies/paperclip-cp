# Deep Review Skill

## Purpose
Perform a thorough, multi-pass code review that checks correctness, security, maintainability, performance, and alignment with project standards.

## When to Use
- Before merging a large or complex PR
- When introducing a new pattern or architectural decision
- When reviewing work produced by another agent or developer
- Before a release that includes non-trivial changes

## Inputs Required
- Diff or list of changed files
- PR description or task description
- Project coding standards (if available)
- Test coverage output (if available)

## Allowed Actions
- Read all changed files and their immediate dependencies
- Run linting and type checks
- Comment on specific lines/functions with issues
- Suggest alternative approaches
- Approve or request changes

## Forbidden Actions
- Do NOT make changes during the review — suggest only
- Do NOT review files that were not changed in this PR
- Do NOT run migrations or deployments
- Do NOT approve if critical issues are unresolved

## Step-by-Step Workflow

### Pass 1 — Structural Review (High Level)
- Does this change achieve what the PR description claims?
- Are there missing edge cases?
- Does it introduce scope creep?
- Is the overall approach sound?

### Pass 2 — Code Quality
- Are names clear and consistent?
- Is there unnecessary complexity?
- Are there duplicate patterns that should be extracted?
- Are error handling paths complete?
- Are side effects explicit?

### Pass 3 — Security
- Is user input validated and sanitized?
- Are secrets ever logged or exposed?
- Are auth checks correct?
- Are SQL queries parameterized?
- Are file paths sanitized?

### Pass 4 — Tests
- Does the change include appropriate tests?
- Do the tests cover the happy path AND error cases?
- Are test fixtures realistic?
- Would these tests catch a regression?

### Pass 5 — Performance
- Are there obvious N+1 queries?
- Are there unnecessary recomputations?
- Are large payloads bounded?
- Are expensive operations cached?

## Output Format
```
REVIEW SUMMARY
==============
Status: APPROVED | CHANGES REQUESTED | BLOCKED

Critical issues (must fix):
- [ ] <issue>

Non-critical issues (should fix):
- [ ] <issue>

Suggestions (optional):
- [ ] <suggestion>

Positive observations:
- <what was done well>

Overall assessment: <brief paragraph>
```

## Token Budget Rules
- Load only changed files + their direct imports
- Do not load the full codebase
- Limit context to 12,000 tokens max
- If the PR is too large, split into multiple passes

## Escalation Rules
- If security vulnerabilities are found → block PR, notify Engineering Lead immediately
- If the PR introduces breaking changes → block and notify team
- If changes require migration → tag for DBA review

## Examples

### Critical issue example
```
Pass 3 — Security
CRITICAL: Line 47 in api/routes/users.ts — user ID is taken directly from
req.body without validating that it matches the authenticated user's ID.
This allows horizontal privilege escalation.
Must fix before merge.
```

### Suggestion example
```
Pass 2 — Code Quality
Suggestion: The parsePDF() function is duplicated in three places.
Consider extracting it to lib/pdf-utils.ts.
Not blocking — can be addressed in a follow-up.
```
