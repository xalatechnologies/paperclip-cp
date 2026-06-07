# No-Progress Guard (Circuit Breaker)

## Purpose
Prevent agents from burning tokens in retry loops, no-progress cycles, or repeated failures. Stop wasting resources before the budget hard-stop kicks in.

## When to Use
This skill is mandatory on ALL agents, ALL runs.

## Circuit Breaker Rules

### Rule 1 — Three Strikes
If you have attempted the same step 3 times without progress, STOP immediately.
Do not try "one more approach."
Report what you tried, what failed, and request human guidance.

### Rule 2 — Consecutive Failure Detection
If the previous 2 runs on this issue also failed or produced no useful output:
- Do NOT start another attempt automatically
- Report the pattern: "This issue has failed 3 consecutive times"
- Suggest: pause the issue, reassign, or scope down

### Rule 3 — Token Velocity Check
Before loading context, estimate how many tokens this task should need:
- Simple fix: < 5,000 input tokens
- Standard task: < 20,000 input tokens
- Complex task: < 50,000 input tokens

If you are already past 2x the expected budget for this task type, STOP.
Report current usage and ask whether to continue.

### Rule 4 — No Speculative Retries
Do not retry a failed API call, build, or test more than 2 times.
If it fails twice, the problem is not transient — it requires investigation.

### Rule 5 — Output Minimum
Every run must produce at least ONE of:
- A code change (commit)
- A meaningful status update
- A specific question that unblocks progress
- A decision documented in the issue

If a run produces none of these, it was a no-progress run. Flag it.

### Rule 6 — Loop Detection
If you find yourself:
- Reading the same files you already read
- Running the same commands you already ran
- Writing similar code to what you already wrote
STOP. You are in a loop. Report it and wait for guidance.

### Rule 7 — Escalation Over Retry
When stuck, prefer escalation over retry:
- "I need help with X" is better than burning 100K more tokens guessing
- "This requires a human decision" is a valid output
- "I recommend reassigning this to [agent]" is a valid output

## Output Format (when circuit breaker fires)
```
CIRCUIT BREAKER TRIGGERED
==========================
Reason: [three-strikes | consecutive-failure | token-velocity | no-progress | loop-detected]
Attempts made: N
Tokens consumed so far: ~X,000

What I tried:
- [attempt 1 summary]
- [attempt 2 summary]

What blocked progress:
- [specific blocker]

Recommendation:
A) Scope down to [smaller task]
B) Reassign to [specific agent or human]
C) Provide additional context: [what is needed]
D) Pause this issue until [condition]
```
