import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ── Goals ──────────────────────────────────────────────────────────────────
  goals: defineTable({
    paperclip_company_id: v.string(),
    title:               v.string(),
    description:         v.optional(v.string()),
    status:              v.union(
      v.literal("planned"),
      v.literal("in_progress"),
      v.literal("done"),
    ),
    priority: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
    ),
    progress_pct: v.number(),
    due_date:     v.optional(v.string()),
  })
    .index("by_company_id", ["paperclip_company_id"])
    .index("by_status",     ["status"]),

  // ── Milestones ─────────────────────────────────────────────────────────────
  milestones: defineTable({
    goal_id:  v.id("goals"),
    title:    v.string(),
    status:   v.union(
      v.literal("planned"),
      v.literal("in_progress"),
      v.literal("done"),
    ),
    position: v.number(),
  }).index("by_goal_id", ["goal_id"]),

  // ── Tasks ──────────────────────────────────────────────────────────────────
  tasks: defineTable({
    milestone_id:       v.id("milestones"),
    title:              v.string(),
    status:             v.union(
      v.literal("planned"),
      v.literal("in_progress"),
      v.literal("done"),
      v.literal("blocked"),
    ),
    paperclip_agent_id: v.optional(v.string()),
    skill_slug:         v.optional(v.string()),
  }).index("by_milestone_id", ["milestone_id"]),

  // ── Routines (mirror of VPS scheduled_jobs) ────────────────────────────────
  // Synced from VPS every 5 min by cron. UI reads from here reactively.
  routines: defineTable({
    vps_job_id:       v.string(),  // scheduled_jobs.id on VPS Postgres
    name:             v.string(),
    cron_expression:  v.string(),
    enabled:          v.boolean(),
    agent_id:         v.string(),
    skill_slug:       v.optional(v.string()),
    company_id:       v.string(),
    company_name:     v.string(),
    agent_name:       v.string(),
    last_run_at:      v.optional(v.string()),
    last_status:      v.optional(v.string()),
    run_count:        v.number(),
    avg_duration_sec: v.optional(v.number()),
  })
    .index("by_company_id",  ["company_id"])
    .index("by_vps_job_id",  ["vps_job_id"]),

  // ── Routine Runs ───────────────────────────────────────────────────────────
  // Individual execution records. High-churn → separate table.
  routineRuns: defineTable({
    vps_job_id:   v.string(),
    routine_id:   v.optional(v.id("routines")),
    started_at:   v.string(),
    finished_at:  v.optional(v.string()),
    status:       v.string(),
    duration_sec: v.optional(v.number()),
    output:       v.optional(v.string()),
    error:        v.optional(v.string()),
  })
    .index("by_vps_job_id",  ["vps_job_id"])
    .index("by_routine_id",  ["routine_id"]),

  // ── Agent Memory ───────────────────────────────────────────────────────────
  agentMemory: defineTable({
    paperclip_agent_id:   v.string(),
    paperclip_company_id: v.string(),
    type: v.union(
      v.literal("fact"),
      v.literal("summary"),
      v.literal("error"),
      v.literal("preference"),
    ),
    content:     v.string(),
    source:      v.optional(v.string()),   // routine run ID for traceability
    importance:  v.number(),               // 1–5
    token_count: v.number(),
    expires_at:  v.optional(v.number()),   // Unix ms, null = permanent
  })
    .index("by_agent_id",      ["paperclip_agent_id"])
    .index("by_company_id",    ["paperclip_company_id"])
    .index("by_agent_id_and_importance", ["paperclip_agent_id", "importance"]),

  // ── Context Rules ──────────────────────────────────────────────────────────
  contextRules: defineTable({
    paperclip_agent_id:   v.string(),
    paperclip_company_id: v.string(),
    rule_type: v.string(), // "budget_cap" | "knowledge_filter" | "memory_filter" | "injection_order" | "trim_strategy"
    label:    v.string(),
    config:   v.any(),   // rule-specific JSON config
    enabled:  v.boolean(),
    priority: v.number(),
  })
    .index("by_agent_id",   ["paperclip_agent_id"])
    .index("by_company_id", ["paperclip_company_id"]),
});
