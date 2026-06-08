import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({

  // ── Goals ────────────────────────────────────────────────────────────────
  goals: defineTable({
    paperclip_company_id: v.string(),
    title:                v.string(),
    description:          v.optional(v.string()),
    status: v.union(
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
    // Two-way sync fields
    paperclip_goal_id: v.optional(v.string()), // ID assigned by Paperclip after push
    pushed_at:         v.optional(v.number()), // ms timestamp of last successful writeback
  })
    .index("by_company_id",    ["paperclip_company_id"])
    .index("by_status",        ["status"])
    .index("by_paperclip_id",  ["paperclip_goal_id"]),

  // ── Milestones ───────────────────────────────────────────────────────────
  milestones: defineTable({
    goal_id:  v.id("goals"),
    title:    v.string(),
    status: v.union(
      v.literal("planned"),
      v.literal("in_progress"),
      v.literal("done"),
    ),
    position: v.number(),
  }).index("by_goal_id", ["goal_id"]),

  // ── Tasks ────────────────────────────────────────────────────────────────
  tasks: defineTable({
    milestone_id:       v.id("milestones"),
    title:              v.string(),
    status: v.union(
      v.literal("planned"),
      v.literal("in_progress"),
      v.literal("done"),
      v.literal("blocked"),
    ),
    paperclip_agent_id: v.optional(v.string()),
    skill_slug:         v.optional(v.string()),
  }).index("by_milestone_id", ["milestone_id"]),

  // ── Routines (mirror of VPS scheduled_jobs) ──────────────────────────────
  routines: defineTable({
    vps_job_id:       v.string(),
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
    .index("by_company_id", ["company_id"])
    .index("by_vps_job_id", ["vps_job_id"]),

  // ── Routine Runs ─────────────────────────────────────────────────────────
  routineRuns: defineTable({
    vps_job_id:   v.string(),
    routine_id:   v.optional(v.id("routines")),
    started_at:   v.string(),
    finished_at:  v.optional(v.string()),
    status:       v.string(), // "running" | "success" | "failed"
    duration_sec: v.optional(v.number()),
    output:       v.optional(v.string()),
    live_output:  v.optional(v.string()), // streaming partial output
    error:        v.optional(v.string()),
  })
    .index("by_vps_job_id", ["vps_job_id"])
    .index("by_routine_id", ["routine_id"]),

  // ── Agent Memory ─────────────────────────────────────────────────────────
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
    source:      v.optional(v.string()),
    importance:  v.number(),
    token_count: v.number(),
    expires_at:  v.optional(v.number()),
  })
    .index("by_agent_id",                   ["paperclip_agent_id"])
    .index("by_company_id",                 ["paperclip_company_id"])
    .index("by_agent_id_and_importance",    ["paperclip_agent_id", "importance"]),

  // ── Context Rules ────────────────────────────────────────────────────────
  contextRules: defineTable({
    paperclip_agent_id:   v.string(),
    paperclip_company_id: v.string(),
    rule_type: v.string(), // "budget_cap" | "knowledge_filter" | "memory_filter" | "injection_order" | "trim_strategy"
    label:    v.string(),
    config:   v.any(),
    enabled:  v.boolean(),
    priority: v.number(),
  })
    .index("by_agent_id",   ["paperclip_agent_id"])
    .index("by_company_id", ["paperclip_company_id"]),

  // ── Secrets (encrypted vault) ─────────────────────────────────────────────
  // encryptedValue is AES-256-GCM. NEVER return it to the client —
  // only `internal.secrets.getEncrypted` (internalQuery) exposes it.
  secrets: defineTable({
    name:                 v.string(),
    encryptedValue:       v.string(),
    scope:                v.string(), // "global" | "company" | "agent"
    paperclip_company_id: v.optional(v.string()),
    paperclip_agent_id:   v.optional(v.string()),
    description:          v.optional(v.string()),
    rotate_after_days:    v.optional(v.number()),
  })
    .index("by_company_id", ["paperclip_company_id"])
    .index("by_scope",      ["scope"]),

  // ── Audit Logs ────────────────────────────────────────────────────────────
  // High-write append-only. Insert via internalMutation only.
  auditLogs: defineTable({
    action:        v.string(),
    actor_id:      v.optional(v.string()),
    resource_type: v.string(),
    resource_id:   v.optional(v.string()),
    metadata:      v.optional(v.string()),
    ip_address:    v.optional(v.string()),
  })
    .index("by_action",                        ["action"])
    .index("by_resource_type_and_resource_id", ["resource_type", "resource_id"]),

  // ── Notification Channels ─────────────────────────────────────────────────
  notificationChannels: defineTable({
    name:                 v.string(),
    type:                 v.string(), // "slack" | "webhook" | "email"
    enabled:              v.boolean(),
    paperclip_company_id: v.optional(v.string()),
    encryptedConfig:      v.string(), // JSON blob, AES-256-GCM encrypted
    events:               v.array(v.string()),
  }).index("by_company_id", ["paperclip_company_id"]),

  // ── Knowledge Collections ─────────────────────────────────────────────────
  knowledgeCollections: defineTable({
    name:                 v.string(),
    paperclip_company_id: v.string(),
    description:          v.optional(v.string()),
    embedding_model:      v.string(), // "text-embedding-3-small"
    chunk_strategy:       v.string(), // "sliding_512"
    bound_agent_ids:      v.array(v.string()),
    status:               v.string(), // "ready" | "indexing" | "error"
    doc_count:            v.number(),
    chunk_count:          v.number(),
  }).index("by_company_id", ["paperclip_company_id"]),

  // ── Knowledge Documents ───────────────────────────────────────────────────
  knowledgeDocuments: defineTable({
    collection_id: v.id("knowledgeCollections"),
    name:          v.string(),
    file_type:     v.string(), // "text" | "markdown" | "pdf"
    content:       v.string(), // raw text — not returned to client by default
    chunk_count:   v.number(),
    size_bytes:    v.number(),
  }).index("by_collection_id", ["collection_id"]),

  // ── Knowledge Chunks (RAG) ────────────────────────────────────────────────
  // Embeddings stored as float64 array (Convex native vectorIndex requirement).
  // 1536 dims from text-embedding-3-small.
  //
  // REPLACED: manual cosineSimilarity() in JS → Convex native ANN vectorIndex
  // SEARCH:   ctx.vectorSearch("knowledgeChunks", "by_embedding", { vector, limit, filter })
  knowledgeChunks: defineTable({
    document_id:   v.id("knowledgeDocuments"),
    collection_id: v.id("knowledgeCollections"),
    chunk_index:   v.number(),
    content:       v.string(),
    token_count:   v.number(),
    embedding:     v.optional(v.array(v.float64())), // Float32Array values as number[]
  })
    .index("by_document_id",   ["document_id"])
    .index("by_collection_id", ["collection_id"])
    .vectorIndex("by_embedding", {
      vectorField:  "embedding",
      dimensions:   1536, // text-embedding-3-small
      filterFields: ["collection_id"],
    }),
});
