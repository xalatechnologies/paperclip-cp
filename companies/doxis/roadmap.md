# Doxis Engineering Studio — Roadmap

**Company**: Doxis Engineering Studio
**Managed by**: Paperclip Control Center
**Last updated**: June 2026

---

## Active Goal: SmartForms Modernization

**Goal**: Reduce regression risk and improve editor maintainability in the Doxis SmartForms module.

### Milestone 1: Baseline Modernization

| Task | Agent | Priority | Status |
|---|---|---|---|
| Upgrade dependencies | Engineering Lead | High | Pending |
| Add regression tests for SmartForms | Bug Fix Agent | High | Pending |
| Convert critical JSX to TypeScript | Engineering Lead | High | Pending |
| Extract Doxis UI components | Engineering Lead | Medium | Pending |
| Add PDF import validation loop | Bug Fix Agent | High | Pending |

### Milestone 2: Quality Gates

| Task | Agent | Priority | Status |
|---|---|---|---|
| Deep review of SmartForms core | Deep Review Agent | High | Pending |
| Release readiness check | QA Release Agent | High | Pending |
| Release notes generation | QA Release Agent | Medium | Pending |

---

## Agent Setup

| Agent | Paperclip ID | Status | Skills |
|---|---|---|---|
| Engineering Lead | PLACEHOLDER | Not created | context-budget-guard, deep-review |
| Bug Fix Agent | PLACEHOLDER | Not created | bug-fixing, context-budget-guard |
| Deep Review Agent | PLACEHOLDER | Not created | deep-review, context-budget-guard |
| QA Release Agent | PLACEHOLDER | Not created | context-budget-guard |

> **Action needed**: Add real Paperclip agent IDs after creating agents in Paperclip UI

---

## Token Budget Policy

All Doxis agents follow the `context-budget-guard` skill rules:

- Default budget: 8,000 tokens per task
- Deep review budget: 12,000 tokens per PR
- Architecture decisions: 15,000 tokens (Engineering Lead only)
- Full codebase analysis: Requires explicit approval

---

## Integration Status

| Integration | Status |
|---|---|
| Slack | Planned (Phase 3) |
| GitHub | Planned (Phase 3) |
| Linear | Planned (Phase 4) |
