# Bug Fixing Skill

## Purpose
Systematically investigate, reproduce, fix, and document bugs with minimal scope creep and clear regression prevention.

## When to Use
- When a bug report arrives with a specific symptom or error
- When a regression is detected in CI or manual testing
- When a user-facing defect needs a targeted fix

## Inputs Required
- Bug description (what fails, what is expected)
- Reproduction steps (if available)
- Affected file or component (if known)
- Stack trace or error message (if available)

## Allowed Actions
- Read source files relevant to the bug
- Run targeted tests for the affected module
- Modify only the code directly responsible for the bug
- Write a regression test for the fixed case
- Update CHANGELOG or inline comments if needed

## Forbidden Actions
- Do NOT refactor unrelated code while fixing a bug
- Do NOT change APIs, function signatures, or interfaces unless required by the fix
- Do NOT add new dependencies
- Do NOT remove or modify unrelated tests
- Do NOT change anything outside the minimum required scope

## Step-by-Step Workflow

### Step 1 — Understand
- Read the bug report carefully
- Identify the affected component or function
- Confirm the expected vs. actual behavior

### Step 2 — Reproduce
- Find the relevant code path
- Confirm the bug exists in the codebase
- Write a minimal failing test (if possible before fixing)

### Step 3 — Fix
- Apply the minimal change that resolves the bug
- Preserve all existing behavior not described in the bug report
- Do not touch anything outside the failing code path

### Step 4 — Verify
- Run all tests in the affected module
- Confirm the regression test passes
- Confirm no previously passing tests now fail

### Step 5 — Document
- Write a clear commit message: `fix(module): description of bug and fix`
- Add a comment near the fix if the reason is non-obvious
- Note in the PR what was changed and why

## Output Format
```
FIX SUMMARY
============
Bug: <brief description>
Root cause: <root cause>
Files changed: <list>
Regression test: <yes/no + location>
Risk: <low/medium/high — explain if medium or high>
```

## Token Budget Rules
- Load only the files directly related to the bug
- Do not load the entire codebase
- Stop and ask if the bug spans more than 5 files — it may need escalation
- Target: 8,000 tokens of context max

## Escalation Rules
- If the bug requires changing a public API → escalate to Engineering Lead
- If the fix requires a database migration → escalate to Engineering Lead
- If the root cause is unclear after 2 passes → ask for more context

## Examples

### Good fix commit
```
fix(forms): prevent null dereference when PDF import has no pages

Root cause: importPDF() did not guard against empty pages array.
Added early return and unit test for zero-page PDFs.
```

### Bad fix (scope creep)
```
fix(forms): fix PDF import AND refactor importPDF to use async/await AND
update all test fixtures AND rename helper functions
```
The above violates the forbidden actions. Each concern must be separate.
