/**
 * Goals, Milestones, Tasks
 *
 * Public queries/mutations consumed by the Next.js dashboard via useQuery/useMutation.
 * Progress rollup runs automatically on every task status change.
 */

import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { Id, Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

// ── Progress rollup helpers ────────────────────────────────────────────────

async function rollupMilestone(ctx: MutationCtx, milestoneId: Id<"milestones">) {
  const tasks = await ctx.db
    .query("tasks")
    .withIndex("by_milestone_id", (q) => q.eq("milestone_id", milestoneId))
    .take(500);

  if (tasks.length === 0) return;

  const allDone   = tasks.every((t) => t.status === "done");
  const anyActive = tasks.some((t) => t.status === "in_progress" || t.status === "done");
  const newStatus = allDone ? "done" : anyActive ? "in_progress" : "planned";

  const ms = await ctx.db.get(milestoneId);
  if (ms && ms.status !== newStatus) {
    await ctx.db.patch(milestoneId, { status: newStatus });
  }
}

async function rollupGoal(ctx: MutationCtx, goalId: Id<"goals">) {
  const milestones = await ctx.db
    .query("milestones")
    .withIndex("by_goal_id", (q) => q.eq("goal_id", goalId))
    .take(200);

  if (milestones.length === 0) return;

  const allDone   = milestones.every((m) => m.status === "done");
  const anyActive = milestones.some((m) => m.status === "in_progress" || m.status === "done");
  const newStatus = allDone ? "done" : anyActive ? "in_progress" : "planned";

  // Calculate progress_pct from tasks across all milestones
  let total = 0, done = 0;
  for (const ms of milestones) {
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_milestone_id", (q) => q.eq("milestone_id", ms._id))
      .take(500);
    total += tasks.length;
    done  += tasks.filter((t) => t.status === "done").length;
  }
  const progress_pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const goal = await ctx.db.get(goalId);
  if (goal) {
    await ctx.db.patch(goalId, { status: newStatus, progress_pct });
  }
}

// ── Goals ──────────────────────────────────────────────────────────────────

export const listGoals = query({
  args: { company_id: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const goalQuery = args.company_id
      ? ctx.db.query("goals").withIndex("by_company_id", (q) => q.eq("paperclip_company_id", args.company_id!))
      : ctx.db.query("goals");

    const goals = await goalQuery.take(100);

    return Promise.all(
      goals.map(async (goal) => {
        const milestones = await ctx.db
          .query("milestones")
          .withIndex("by_goal_id", (q) => q.eq("goal_id", goal._id))
          .take(50);

        const milestonesWithTasks = await Promise.all(
          milestones.map(async (ms) => {
            const tasks = await ctx.db
              .query("tasks")
              .withIndex("by_milestone_id", (q) => q.eq("milestone_id", ms._id))
              .take(100);
            return { ...ms, tasks };
          })
        );

        return { ...goal, milestones: milestonesWithTasks };
      })
    );
  },
});

export const createGoal = mutation({
  args: {
    paperclip_company_id: v.string(),
    title:       v.string(),
    description: v.optional(v.string()),
    status:      v.optional(v.string()),
    priority:    v.optional(v.string()),
    due_date:    v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("goals", {
      paperclip_company_id: args.paperclip_company_id,
      title:       args.title,
      description: args.description,
      status:      (args.status as any) ?? "planned",
      priority:    (args.priority as any) ?? "medium",
      progress_pct: 0,
      due_date:    args.due_date,
    });
  },
});

export const updateGoal = mutation({
  args: {
    id:          v.id("goals"),
    title:       v.optional(v.string()),
    description: v.optional(v.string()),
    status:      v.optional(v.string()),
    priority:    v.optional(v.string()),
    due_date:    v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...patch } = args;
    const updates: Record<string, any> = {};
    if (patch.title       !== undefined) updates.title       = patch.title;
    if (patch.description !== undefined) updates.description = patch.description;
    if (patch.status      !== undefined) updates.status      = patch.status;
    if (patch.priority    !== undefined) updates.priority    = patch.priority;
    if (patch.due_date    !== undefined) updates.due_date    = patch.due_date;
    await ctx.db.patch(id, updates);
    return await ctx.db.get(id);
  },
});

export const deleteGoal = mutation({
  args: { id: v.id("goals") },
  handler: async (ctx, args) => {
    // Cascade: milestones → tasks
    const milestones = await ctx.db
      .query("milestones")
      .withIndex("by_goal_id", (q) => q.eq("goal_id", args.id))
      .take(200);
    for (const ms of milestones) {
      const tasks = await ctx.db
        .query("tasks")
        .withIndex("by_milestone_id", (q) => q.eq("milestone_id", ms._id))
        .take(500);
      for (const t of tasks) await ctx.db.delete(t._id);
      await ctx.db.delete(ms._id);
    }
    await ctx.db.delete(args.id);
  },
});

// ── Milestones ─────────────────────────────────────────────────────────────

export const createMilestone = mutation({
  args: {
    goal_id:  v.id("goals"),
    title:    v.string(),
    position: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("milestones", {
      goal_id:  args.goal_id,
      title:    args.title,
      status:   "planned",
      position: args.position ?? 0,
    });
  },
});

export const updateMilestone = mutation({
  args: {
    id:      v.id("milestones"),
    goal_id: v.id("goals"),   // needed for rollup
    title:   v.optional(v.string()),
    status:  v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const updates: Record<string, any> = {};
    if (args.title  !== undefined) updates.title  = args.title;
    if (args.status !== undefined) updates.status = args.status;
    await ctx.db.patch(args.id, updates);
    await rollupGoal(ctx, args.goal_id);
    return await ctx.db.get(args.id);
  },
});

export const deleteMilestone = mutation({
  args: { id: v.id("milestones"), goal_id: v.id("goals") },
  handler: async (ctx, args) => {
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_milestone_id", (q) => q.eq("milestone_id", args.id))
      .take(500);
    for (const t of tasks) await ctx.db.delete(t._id);
    await ctx.db.delete(args.id);
    await rollupGoal(ctx, args.goal_id);
  },
});

// ── Tasks ──────────────────────────────────────────────────────────────────

export const createTask = mutation({
  args: {
    milestone_id:       v.id("milestones"),
    goal_id:            v.id("goals"),
    title:              v.string(),
    paperclip_agent_id: v.optional(v.string()),
    skill_slug:         v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("tasks", {
      milestone_id:       args.milestone_id,
      title:              args.title,
      status:             "planned",
      paperclip_agent_id: args.paperclip_agent_id,
      skill_slug:         args.skill_slug,
    });
    await rollupMilestone(ctx, args.milestone_id);
    await rollupGoal(ctx, args.goal_id);
    return id;
  },
});

export const updateTask = mutation({
  args: {
    id:           v.id("tasks"),
    milestone_id: v.id("milestones"),
    goal_id:      v.id("goals"),
    status:       v.optional(v.string()),
    paperclip_agent_id: v.optional(v.string()),
    skill_slug:   v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const updates: Record<string, any> = {};
    if (args.status             !== undefined) updates.status             = args.status;
    if (args.paperclip_agent_id !== undefined) updates.paperclip_agent_id = args.paperclip_agent_id;
    if (args.skill_slug         !== undefined) updates.skill_slug         = args.skill_slug;
    await ctx.db.patch(args.id, updates);
    await rollupMilestone(ctx, args.milestone_id);
    await rollupGoal(ctx, args.goal_id);
    return await ctx.db.get(args.id);
  },
});

export const deleteTask = mutation({
  args: { id: v.id("tasks"), milestone_id: v.id("milestones"), goal_id: v.id("goals") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
    await rollupMilestone(ctx, args.milestone_id);
    await rollupGoal(ctx, args.goal_id);
  },
});

// ── Internal: bulk upsert from API (push model) ───────────────────────────

export const upsertGoalFromApi = internalMutation({
  args: {
    paperclip_company_id: v.string(),
    title:       v.string(),
    description: v.optional(v.string()),
    status:      v.optional(v.string()),
    priority:    v.optional(v.string()),
    progress_pct: v.optional(v.number()),
    due_date:    v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Insert always — goals created via API are new records
    return ctx.db.insert("goals", {
      paperclip_company_id: args.paperclip_company_id,
      title:        args.title,
      description:  args.description,
      status:       (args.status as any)   ?? "planned",
      priority:     (args.priority as any) ?? "medium",
      progress_pct: args.progress_pct      ?? 0,
      due_date:     args.due_date,
      // pushed_at intentionally omitted — marks as "pending writeback"
    });
  },
});

// ── Two-way sync: Convex → Paperclip ────────────────────────────────────────

/** Mark a goal as successfully pushed to Paperclip */
export const markPushed = internalMutation({
  args: {
    _id:               v.id("goals"),
    paperclip_goal_id: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args._id, {
      paperclip_goal_id: args.paperclip_goal_id,
      pushed_at:         Date.now(),
    });
  },
});

/** Goals not yet pushed to Paperclip (no pushed_at) */
export const listPendingPush = query({
  args: { company_id: v.optional(v.string()) },
  handler: async (ctx) => {
    const all = await ctx.db.query("goals").take(200);
    return all.filter((g) => !g.pushed_at);
  },
});

/** Internal version — called by convex/jobs.ts pushPendingGoals action */
export const listPendingPushInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("goals").take(200);
    return all.filter((g) => !g.pushed_at);
  },
});

/** Sync goals FROM Paperclip API into Convex (inbound) */
export const upsertFromPaperclip = internalMutation({
  args: {
    goals: v.array(v.object({
      paperclip_goal_id: v.string(),
      paperclip_company_id: v.string(),
      title:        v.string(),
      description:  v.optional(v.string()),
      status:       v.string(),
      priority:     v.optional(v.string()),
      progress_pct: v.optional(v.number()),
      due_date:     v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    let upserted = 0;
    for (const g of args.goals) {
      const existing = await ctx.db
        .query("goals")
        .withIndex("by_paperclip_id", (q) =>
          q.eq("paperclip_goal_id", g.paperclip_goal_id)
        )
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, {
          title:        g.title,
          description:  g.description,
          status:       (g.status as any) ?? "planned",
          priority:     (g.priority as any) ?? "medium",
          progress_pct: g.progress_pct ?? 0,
          due_date:     g.due_date,
          pushed_at:    Date.now(), // mark as synced
        });
      } else {
        await ctx.db.insert("goals", {
          paperclip_company_id: g.paperclip_company_id,
          paperclip_goal_id:    g.paperclip_goal_id,
          title:        g.title,
          description:  g.description,
          status:       (g.status as any) ?? "planned",
          priority:     (g.priority as any) ?? "medium",
          progress_pct: g.progress_pct ?? 0,
          due_date:     g.due_date,
          pushed_at:    Date.now(),
        });
      }
      upserted++;
    }
    return upserted;
  },
});
