'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Target, Plus, CheckCircle, Circle, Flame, Flag,
  Building2, Bot, ChevronRight, ChevronDown,
  Milestone, ListTodo, Trash2, RefreshCw, AlertTriangle,
  BookOpen, Clock,
} from 'lucide-react';
import { TEXT, LAYOUT, CARD } from '@/lib/tokens';
import { cn } from '@/lib/utils';
import {
  PageHeader, PageBody, PageLayout,
  StatCard, StatGrid,
  SidebarSection, SidebarDivider, SidebarRow,
  EmptyState,
} from '@/components/ui';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const AUTH = {
  Authorization: `Bearer ${process.env.NEXT_PUBLIC_CONTROL_CENTER_API_KEY ?? ''}`,
  'Content-Type': 'application/json',
};

// Returns [] when the response is not OK or not an array (e.g. 503 error object)
async function safeArr(res: Response): Promise<any[]> {
  if (!res.ok) return [];
  try { const d = await res.json(); return Array.isArray(d) ? d : []; }
  catch { return []; }
}

// ── Types ─────────────────────────────────────────────────────────────────

interface Task {
  id: string; milestone_id: string; title: string;
  paperclip_agent_id: string | null; skill_slug: string | null;
  status: 'planned' | 'in_progress' | 'done';
}
interface Milestone {
  id: string; goal_id: string; title: string;
  status: 'planned' | 'in_progress' | 'done'; position: number;
  tasks: Task[];
}
interface Goal {
  id: string; paperclip_company_id: string; title: string;
  description: string | null; status: 'planned' | 'in_progress' | 'done' | 'cancelled';
  priority: 'low' | 'medium' | 'high'; due_date: string | null;
  milestones: Milestone[]; task_count: number; done_count: number;
  created_at: number; updated_at: number;
}
interface VpsAgent { id: string; name: string; role: string; company_id: string; company_name: string; }
interface VpsSkill { slug: string; name: string; company_id: string; }
interface VpsCompany { id: string; name: string; }

// ── Status / priority configs ──────────────────────────────────────────────

const S = {
  done:        { icon: CheckCircle, color: 'text-success',     bg: 'bg-success/10',      label: 'Done' },
  in_progress: { icon: Flame,       color: 'text-warning',     bg: 'bg-warning/10',      label: 'In Progress' },
  planned:     { icon: Circle,      color: 'text-muted-foreground', bg: 'bg-muted',      label: 'Planned' },
  cancelled:   { icon: Circle,      color: 'text-destructive', bg: 'bg-destructive/10',  label: 'Cancelled' },
};
const P = {
  high:   { color: 'text-destructive', bg: 'bg-destructive/10', label: 'High' },
  medium: { color: 'text-warning',     bg: 'bg-warning/10',     label: 'Medium' },
  low:    { color: 'text-muted-foreground', bg: 'bg-muted',     label: 'Low' },
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Task row ──────────────────────────────────────────────────────────────

function TaskRow({
  task, agents, onStatusChange, onDelete,
}: {
  task: Task;
  agents: VpsAgent[];
  onStatusChange: (id: string, status: string) => void;
  onDelete: (id: string) => void;
}) {
  const cfg = S[task.status] ?? S.planned;
  const agent = agents.find(a => a.id === task.paperclip_agent_id);
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors group">
      <button
        onClick={() => {
          const next = task.status === 'planned' ? 'in_progress' : task.status === 'in_progress' ? 'done' : 'planned';
          onStatusChange(task.id, next);
        }}
        className="flex-shrink-0"
      >
        <cfg.icon className={cn('w-4 h-4 transition-colors', cfg.color, 'hover:opacity-70')} strokeWidth={2} />
      </button>
      <span className={cn('text-[13px] flex-1', task.status === 'done' ? 'line-through text-muted-foreground/50' : 'text-foreground')}>
        {task.title}
      </span>
      {agent && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Bot className="w-3 h-3" /> {agent.name}
        </div>
      )}
      {task.skill_slug && (
        <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{task.skill_slug}</span>
      )}
      <button onClick={() => onDelete(task.id)}
        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-muted-foreground/40 hover:text-destructive transition-all">
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}

// ── Milestone block ────────────────────────────────────────────────────────

function MilestoneBlock({
  m, agents, goalId,
  onTaskStatusChange, onTaskDelete, onMilestoneStatusChange,
}: {
  m: Milestone; agents: VpsAgent[]; goalId: string;
  onTaskStatusChange: (gId: string, mId: string, tId: string, status: string) => void;
  onTaskDelete: (gId: string, mId: string, tId: string) => void;
  onMilestoneStatusChange: (gId: string, mId: string, status: string) => void;
}) {
  const [open, setOpen] = useState(m.status === 'in_progress');
  const cfg = S[m.status] ?? S.planned;
  const done = m.tasks.filter(t => t.status === 'done').length;

  return (
    <div className="border border-border/60 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/20 transition-colors"
      >
        <button onClick={e => {
          e.stopPropagation();
          const next = m.status === 'planned' ? 'in_progress' : m.status === 'in_progress' ? 'done' : 'planned';
          onMilestoneStatusChange(goalId, m.id, next);
        }}>
          <cfg.icon className={cn('w-4 h-4 flex-shrink-0', cfg.color)} strokeWidth={2} />
        </button>
        <span className="text-[13px] font-semibold text-card-foreground flex-1">{m.title}</span>
        <span className="text-[11px] text-muted-foreground">{done}/{m.tasks.length}</span>
        {open ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/40" />
               : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40" />}
      </button>
      {open && m.tasks.length > 0 && (
        <div className="border-t border-border/40 divide-y divide-border/30">
          {m.tasks.map(t => (
            <TaskRow
              key={t.id} task={t} agents={agents}
              onStatusChange={(tId, status) => onTaskStatusChange(goalId, m.id, tId, status)}
              onDelete={(tId) => onTaskDelete(goalId, m.id, tId)}
            />
          ))}
        </div>
      )}
      {open && m.tasks.length === 0 && (
        <div className="border-t border-border/40 px-4 py-3 text-[12px] text-muted-foreground/50">No tasks yet</div>
      )}
    </div>
  );
}

// ── Add Goal Modal ─────────────────────────────────────────────────────────

function AddGoalForm({
  companies, onAdd, onClose,
}: {
  companies: VpsCompany[];
  onAdd: (data: any) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    paperclip_company_id: companies[0]?.id ?? '',
    title: '', description: '', status: 'planned', priority: 'medium', due_date: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    await onAdd(form);
    setSaving(false);
  };

  return (
    <div className="bg-card border border-primary/20 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-card-foreground">New Goal</h3>
        <button onClick={onClose} className="text-muted-foreground/40 hover:text-foreground transition-colors text-[18px]">×</button>
      </div>
      <div className="p-5 grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className={cn(TEXT.label, 'block mb-1.5')}>Title</label>
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="e.g. Reduce SmartForms regression risk"
            className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:ring-1 focus:ring-primary/40" />
        </div>
        <div className="col-span-2">
          <label className={cn(TEXT.label, 'block mb-1.5')}>Description</label>
          <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={2} placeholder="What does success look like?"
            className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:ring-1 focus:ring-primary/40 resize-none" />
        </div>
        <div>
          <label className={cn(TEXT.label, 'block mb-1.5')}>Company</label>
          <select value={form.paperclip_company_id} onChange={e => setForm(f => ({ ...f, paperclip_company_id: e.target.value }))}
            className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2.5 text-[13px] text-foreground outline-none">
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className={cn(TEXT.label, 'block mb-1.5')}>Priority</label>
          <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
            className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2.5 text-[13px] text-foreground outline-none">
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div>
          <label className={cn(TEXT.label, 'block mb-1.5')}>Due Date</label>
          <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
            className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2.5 text-[13px] text-foreground outline-none" />
        </div>
        <div className="flex justify-end gap-3 col-span-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-[13px] font-medium text-muted-foreground border border-border rounded-lg hover:bg-muted transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={saving || !form.title.trim()}
            className="flex items-center gap-2 px-5 py-2 text-[13px] font-semibold bg-primary/90 hover:bg-primary text-white rounded-lg transition-colors disabled:opacity-50">
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Create Goal
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
export default function GoalsPage() {
  const [goals, setGoals]       = useState<Goal[]>([]);
  const [agents, setAgents]     = useState<VpsAgent[]>([]);
  const [companies, setCompanies] = useState<VpsCompany[]>([]);
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState<string | null>(null);
  const [showAdd, setShowAdd]   = useState(false);
  const [openGoals, setOpenGoals] = useState<Set<string>>(new Set());

  const fetchAll = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [goalsRes, agentsRes, companiesRes] = await Promise.all([
        fetch(`${API}/api/goals`, { headers: AUTH }),
        fetch(`${API}/api/control/agents`, { headers: AUTH }),
        fetch(`${API}/api/control/companies`, { headers: AUTH }),
      ]);
      const goalsData = await goalsRes.json().then(d => Array.isArray(d) ? d : []).catch(() => []);
      setGoals(goalsData);
      setAgents(await safeArr(agentsRes));
      setCompanies(await safeArr(companiesRes));
      // Auto-open first in-progress goal
      const inProg = goalsData.find((g: Goal) => g.status === 'in_progress');
      if (inProg) setOpenGoals(new Set([inProg.id]));
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleAddGoal = async (data: any) => {
    const res = await fetch(`${API}/api/goals`, { method: 'POST', headers: AUTH, body: JSON.stringify(data) });
    if (res.ok) { setShowAdd(false); await fetchAll(); }
  };

  const handleTaskStatus = async (goalId: string, msId: string, taskId: string, status: string) => {
    await fetch(`${API}/api/goals/${goalId}/milestones/${msId}/tasks/${taskId}`, {
      method: 'PATCH', headers: AUTH, body: JSON.stringify({ status }),
    });
    const s = status as Task['status'];
    setGoals(prev => prev.map(g => g.id !== goalId ? g : {
      ...g,
      milestones: g.milestones.map(m => m.id !== msId ? m : {
        ...m, tasks: m.tasks.map(t => t.id === taskId ? { ...t, status: s } : t),
      }),
    }));
  };


  const handleTaskDelete = async (goalId: string, msId: string, taskId: string) => {
    await fetch(`${API}/api/goals/${goalId}/milestones/${msId}/tasks/${taskId}`, { method: 'DELETE', headers: AUTH });
    setGoals(prev => prev.map(g => g.id !== goalId ? g : {
      ...g,
      milestones: g.milestones.map(m => m.id !== msId ? m : {
        ...m, tasks: m.tasks.filter(t => t.id !== taskId),
      }),
    }));
  };

  const handleMilestoneStatus = async (goalId: string, msId: string, status: string) => {
    await fetch(`${API}/api/goals/${goalId}/milestones/${msId}`, {
      method: 'PATCH', headers: AUTH, body: JSON.stringify({ status }),
    });
    setGoals(prev => prev.map(g => g.id !== goalId ? g : {
      ...g,
      milestones: g.milestones.map(m => m.id === msId ? { ...m, status: status as any } : m),
    }));
  };

  const handleDeleteGoal = async (id: string) => {
    if (!confirm('Delete this goal and all its milestones/tasks?')) return;
    await fetch(`${API}/api/goals/${id}`, { method: 'DELETE', headers: AUTH });
    setGoals(prev => prev.filter(g => g.id !== id));
  };

  const totalTasks = goals.flatMap(g => g.milestones.flatMap(m => m.tasks)).length;
  const doneTasks  = goals.flatMap(g => g.milestones.flatMap(m => m.tasks)).filter(t => t.status === 'done').length;
  const inProgress = goals.filter(g => g.status === 'in_progress').length;

  const sidebar = (
    <div className={LAYOUT.rightSidebar}>
      <SidebarSection title="Overview">
        <SidebarRow label="Total goals"  value={goals.length} />
        <SidebarRow label="In progress"  value={inProgress}   valueClass="text-warning" />
        <SidebarRow label="Tasks done"   value={`${doneTasks}/${totalTasks}`} valueClass="text-success" />
        <SidebarRow label="Agents"       value={agents.length} />
      </SidebarSection>
      <SidebarDivider />
      <SidebarSection title="Companies">
        {companies.slice(0, 5).map(c => (
          <div key={c.id} className="flex items-center gap-2 py-0.5">
            <Building2 className="w-3 h-3 text-muted-foreground" />
            <span className="text-[12px] text-foreground truncate">{c.name}</span>
          </div>
        ))}
        {companies.length === 0 && <div className="text-[12px] text-muted-foreground">VPS not connected</div>}
      </SidebarSection>
      <SidebarDivider />
      <SidebarSection title="Agents Available">
        {agents.slice(0, 6).map(a => (
          <div key={a.id} className="flex items-center gap-2 py-0.5">
            <Bot className="w-3 h-3 text-primary/50" />
            <span className="text-[12px] text-foreground truncate">{a.name}</span>
          </div>
        ))}
        {agents.length === 0 && <div className="text-[12px] text-muted-foreground">VPS not connected</div>}
      </SidebarSection>
    </div>
  );

  return (
    <PageLayout sidebar={sidebar}>
      <PageHeader
        title="Goals & Tasks"
        subtitle="Roadmap · milestones · agent task assignment"
        badge={
          <div className="flex items-center gap-2">
            <button onClick={fetchAll} disabled={loading}
              className="p-2 rounded-lg border border-border bg-card hover:bg-muted transition-colors disabled:opacity-40">
              <RefreshCw className={cn('w-4 h-4 text-muted-foreground', loading && 'animate-spin')} />
            </button>
            <button onClick={() => setShowAdd(v => !v)}
              className="flex items-center gap-2 px-4 py-2 text-[13px] font-semibold rounded-lg bg-primary/90 hover:bg-primary text-white transition-colors">
              <Plus className="w-3.5 h-3.5" /> New Goal
            </button>
          </div>
        }
      />
      <PageBody>
        <StatGrid cols={4}>
          <StatCard label="Goals"       value={goals.length}  sub="total"               icon={Target}      color="text-primary"          ring="primary"   />
          <StatCard label="In Progress" value={inProgress}    sub="active"              icon={Flame}       color="text-warning"          ring="warning"   />
          <StatCard label="Tasks Done"  value={doneTasks}     sub={`of ${totalTasks}`}  icon={CheckCircle} color="text-success"          ring="success"   />
          <StatCard label="Agents"      value={agents.length} sub="from VPS"            icon={Bot}         color="text-muted-foreground" ring="muted"     />
        </StatGrid>

        {showAdd && (
          <AddGoalForm companies={companies} onAdd={handleAddGoal} onClose={() => setShowAdd(false)} />
        )}

        {err && (
          <div className="flex items-center gap-3 p-4 rounded-xl border border-destructive/15 bg-destructive/5">
            <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
            <span className="text-[13px] text-destructive">API error: {err}</span>
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3 text-muted-foreground/30" />
            <div className="text-[13px] text-muted-foreground">Loading goals…</div>
          </div>
        ) : goals.length === 0 ? (
          <EmptyState icon={Target} title="No goals yet" description="Create your first goal to start tracking milestones and assigning tasks to agents." />
        ) : (
          <div className="space-y-5">
            {goals.map(goal => {
              const open = openGoals.has(goal.id);
              const cfg  = S[goal.status] ?? S.planned;
              const pri  = P[goal.priority] ?? P.medium;
              const pct  = goal.task_count > 0 ? Math.round((goal.done_count / goal.task_count) * 100) : 0;

              return (
                <div key={goal.id} className={cn(CARD.base, 'overflow-hidden')}>
                  <div className="flex items-start gap-4 px-6 py-5">
                    <button onClick={() => {
                      setOpenGoals(prev => { const n = new Set(prev); n.has(goal.id) ? n.delete(goal.id) : n.add(goal.id); return n; });
                    }} className="flex-1 text-left">
                      <div className="flex items-center gap-3 flex-wrap mb-1.5">
                        <Flag className={cn('w-4 h-4 flex-shrink-0', pri.color)} strokeWidth={2} />
                        <span className="text-[16px] font-bold text-card-foreground">{goal.title}</span>
                        <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-md', cfg.bg, cfg.color)}>{cfg.label}</span>
                        <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-md', pri.bg, pri.color)}>{pri.label}</span>
                      </div>
                      {goal.description && (
                        <p className="text-[12px] text-muted-foreground mb-3 max-w-2xl">{goal.description}</p>
                      )}
                      <div className="flex items-center gap-6 flex-wrap">
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden min-w-[80px]">
                            <div className="h-full bg-success/60 rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[11px] text-muted-foreground tabular-nums">{pct}%</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <ListTodo className="w-3 h-3" />
                          {goal.done_count}/{goal.task_count} tasks
                        </div>
                        {goal.due_date && (
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            Due {fmtDate(goal.due_date)}
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Building2 className="w-3 h-3" />
                          {companies.find(c => c.id === goal.paperclip_company_id)?.name ?? goal.paperclip_company_id}
                        </div>
                      </div>
                    </button>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {open ? <ChevronDown className="w-4 h-4 text-muted-foreground/40" /> : <ChevronRight className="w-4 h-4 text-muted-foreground/40" />}
                      <button onClick={() => handleDeleteGoal(goal.id)}
                        className="p-1.5 rounded-lg text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {open && (
                    <div className="border-t border-border px-6 py-4 space-y-2.5">
                      <div className={cn(TEXT.label, 'flex items-center gap-2 mb-3')}>
                        <Milestone className="w-3.5 h-3.5" /> Milestones
                      </div>
                      {goal.milestones.length === 0 ? (
                        <div className="text-[12px] text-muted-foreground/50 py-2">No milestones yet</div>
                      ) : (
                        goal.milestones.map(m => (
                          <MilestoneBlock
                            key={m.id} m={m} agents={agents} goalId={goal.id}
                            onTaskStatusChange={handleTaskStatus}
                            onTaskDelete={handleTaskDelete}
                            onMilestoneStatusChange={handleMilestoneStatus}
                          />
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </PageBody>
    </PageLayout>
  );
}
