'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  CalendarClock, Plus, Play, RefreshCw, Trash2, Clock,
  Bot, CheckCircle, AlertTriangle, Activity, BookOpen,
  ToggleRight, ToggleLeft, ChevronDown, ChevronRight,
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

interface Routine {
  id: string;
  name: string;
  paperclip_company_id: string;
  paperclip_agent_id: string;
  skill_slug: string | null;
  schedule: string;
  enabled: number;
  last_run_at: number | null;
  last_status: 'success' | 'failed' | null;
  last_error: string | null;
  run_count: number;
  avg_duration_sec: number | null;
  created_at: number;
}

interface VpsAgent { id: string; name: string; role: string; company_id: string; company_name: string; }
interface VpsSkill { slug: string; name: string; company_id: string; }
interface VpsCompany { id: string; name: string; }

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDuration(sec: number | null) {
  if (sec == null) return '—';
  if (sec < 60) return `${sec.toFixed(0)}s`;
  return `${Math.floor(sec / 60)}m ${(sec % 60).toFixed(0)}s`;
}

function fmtRelative(ts: number | null) {
  if (!ts) return 'Never';
  const diff = Date.now() - ts * 1000;
  const h = Math.floor(diff / 3600000);
  if (h < 1) return `${Math.floor(diff / 60000)}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const CRON_PRESETS = [
  { label: 'Every 30 min', value: '*/30 * * * *' },
  { label: 'Hourly',       value: '0 * * * *' },
  { label: 'Daily 02:00',  value: '0 2 * * *' },
  { label: 'Daily 08:00',  value: '0 8 * * *' },
  { label: 'Monday 09:00', value: '0 9 * * 1' },
  { label: 'Friday 10:00', value: '0 10 * * 5' },
];

// ─── Add Form ─────────────────────────────────────────────────────────────

function AddRoutineForm({
  agents, skills, companies, onAdd, onClose,
}: {
  agents: VpsAgent[]; skills: VpsSkill[]; companies: VpsCompany[];
  onAdd: (d: any) => Promise<void>; onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: '',
    paperclip_company_id: companies[0]?.id ?? '',
    paperclip_agent_id: agents[0]?.id ?? '',
    skill_slug: '',
    schedule: '0 2 * * *',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const filteredAgents = form.paperclip_company_id
    ? agents.filter(a => a.company_id === form.paperclip_company_id)
    : agents;
  const filteredSkills = form.paperclip_company_id
    ? skills.filter(s => s.company_id === form.paperclip_company_id)
    : skills;

  const submit = async () => {
    if (!form.name.trim() || !form.paperclip_agent_id) {
      setErr('Name and agent are required'); return;
    }
    setSaving(true); setErr(null);
    try {
      await onAdd({ ...form, skill_slug: form.skill_slug || null });
      onClose();
    } catch (e: any) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-card border border-primary/20 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-card-foreground">New Routine</h3>
        <button onClick={onClose} className="text-[18px] text-muted-foreground/40 hover:text-foreground">×</button>
      </div>
      <div className="p-5 grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <label className={cn(TEXT.label, 'block mb-1.5')}>Name</label>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Nightly Bug Scan"
            className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:ring-1 focus:ring-primary/40" />
        </div>
        <div>
          <label className={cn(TEXT.label, 'block mb-1.5')}>Company</label>
          <select value={form.paperclip_company_id}
            onChange={e => setForm(f => ({ ...f, paperclip_company_id: e.target.value, paperclip_agent_id: '' }))}
            className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2.5 text-[13px] text-foreground outline-none">
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className={cn(TEXT.label, 'block mb-1.5')}>Agent</label>
          <select value={form.paperclip_agent_id} onChange={e => setForm(f => ({ ...f, paperclip_agent_id: e.target.value }))}
            className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2.5 text-[13px] text-foreground outline-none">
            <option value="">— Select agent —</option>
            {filteredAgents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label className={cn(TEXT.label, 'block mb-1.5')}>Skill (optional)</label>
          <select value={form.skill_slug} onChange={e => setForm(f => ({ ...f, skill_slug: e.target.value }))}
            className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2.5 text-[13px] text-foreground outline-none">
            <option value="">— Any skill —</option>
            {filteredSkills.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className={cn(TEXT.label, 'block mb-1.5')}>Schedule (cron)</label>
          <div className="flex gap-2">
            <input value={form.schedule} onChange={e => setForm(f => ({ ...f, schedule: e.target.value }))}
              placeholder="0 2 * * *" className="flex-1 bg-muted/30 border border-border rounded-lg px-3 py-2.5 text-[13px] font-mono text-foreground outline-none focus:ring-1 focus:ring-primary/40" />
          </div>
        </div>
        <div className="col-span-3">
          <label className={cn(TEXT.label, 'block mb-2')}>Quick presets</label>
          <div className="flex flex-wrap gap-1.5">
            {CRON_PRESETS.map(p => (
              <button key={p.value} onClick={() => setForm(f => ({ ...f, schedule: p.value }))}
                className={cn('px-2.5 py-1 rounded-md text-[11px] border transition-all',
                  form.schedule === p.value
                    ? 'bg-primary/10 border-primary/30 text-primary'
                    : 'bg-muted/20 border-border text-muted-foreground hover:border-border/80')}>
                {p.label}
                <span className="font-mono ml-1 opacity-60">{p.value}</span>
              </button>
            ))}
          </div>
        </div>
        {err && <div className="col-span-3 text-[12px] text-destructive">{err}</div>}
        <div className="col-span-3 flex justify-end gap-3 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-[13px] border border-border rounded-lg text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
          <button onClick={submit} disabled={saving || !form.name.trim()}
            className="flex items-center gap-2 px-5 py-2 text-[13px] font-semibold bg-primary/90 hover:bg-primary text-white rounded-lg transition-colors disabled:opacity-50">
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CalendarClock className="w-3.5 h-3.5" />}
            Create Routine
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
export default function RoutinesPage() {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [agents, setAgents]     = useState<VpsAgent[]>([]);
  const [skills, setSkills]     = useState<VpsSkill[]>([]);
  const [companies, setCompanies] = useState<VpsCompany[]>([]);
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState<string | null>(null);
  const [showAdd, setShowAdd]   = useState(false);
  const [running, setRunning]   = useState<string | null>(null);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [rRes, aRes, sRes, cRes] = await Promise.all([
        fetch(`${API}/api/routines`, { headers: AUTH }),
        fetch(`${API}/api/control/agents`, { headers: AUTH }),
        fetch(`${API}/api/control/skills`, { headers: AUTH }),
        fetch(`${API}/api/control/companies`, { headers: AUTH }),
      ]);
      setRoutines(await safeArr(rRes));
      setAgents(await safeArr(aRes));
      setSkills(await safeArr(sRes));
      setCompanies(await safeArr(cRes));
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleAdd = async (data: any) => {
    const res = await fetch(`${API}/api/routines`, { method: 'POST', headers: AUTH, body: JSON.stringify(data) });
    if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
    await fetchAll();
  };

  const handleToggle = async (id: string, enabled: number) => {
    await fetch(`${API}/api/routines/${id}/toggle`, {
      method: 'PATCH', headers: AUTH, body: JSON.stringify({ enabled: !enabled }),
    });
    setRoutines(prev => prev.map(r => r.id === id ? { ...r, enabled: enabled ? 0 : 1 } : r));
  };

  const handleRunNow = async (id: string) => {
    setRunning(id);
    await fetch(`${API}/api/routines/${id}/run`, { method: 'POST', headers: AUTH });
    setTimeout(() => { setRunning(null); fetchAll(); }, 2000);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this routine?')) return;
    await fetch(`${API}/api/routines/${id}`, { method: 'DELETE', headers: AUTH });
    setRoutines(prev => prev.filter(r => r.id !== id));
  };

  const active = routines.filter(r => r.enabled).length;

  const sidebar = (
    <div className={LAYOUT.rightSidebar}>
      <SidebarSection title="Overview">
        <SidebarRow label="Total"    value={routines.length} />
        <SidebarRow label="Active"   value={active}          valueClass="text-success" />
        <SidebarRow label="Paused"   value={routines.length - active} />
        <SidebarRow label="Total runs" value={routines.reduce((a, r) => a + r.run_count, 0)} />
      </SidebarSection>
      <SidebarDivider />
      <SidebarSection title="Cron Guide">
        <div className="space-y-1.5">
          {CRON_PRESETS.map(p => (
            <div key={p.value} className="flex gap-2 text-[11px]">
              <span className="font-mono text-primary/70 w-28 flex-shrink-0">{p.value}</span>
              <span className="text-muted-foreground">{p.label}</span>
            </div>
          ))}
        </div>
      </SidebarSection>
      <SidebarDivider />
      <SidebarSection title="Powered by">
        <div className="p-3 rounded-lg bg-muted/30 border border-border text-[11px] text-muted-foreground leading-relaxed">
          Routines run as <span className="text-foreground font-semibold">Convex cron functions</span>. Each trigger fires the assigned agent skill on the VPS.
        </div>
      </SidebarSection>
    </div>
  );

  return (
    <PageLayout sidebar={sidebar}>
      <PageHeader
        title="Routines"
        subtitle="Scheduled agent runs · Convex-cron-powered"
        badge={
          <div className="flex items-center gap-2">
            <button onClick={fetchAll} disabled={loading}
              className="p-2 rounded-lg border border-border bg-card hover:bg-muted transition-colors disabled:opacity-40">
              <RefreshCw className={cn('w-4 h-4 text-muted-foreground', loading && 'animate-spin')} />
            </button>
            <button onClick={() => setShowAdd(v => !v)}
              className="flex items-center gap-2 px-4 py-2 text-[13px] font-semibold rounded-lg bg-primary/90 hover:bg-primary text-white transition-colors">
              <Plus className="w-3.5 h-3.5" /> New Routine
            </button>
          </div>
        }
      />
      <PageBody>
        <StatGrid cols={4}>
          <StatCard label="Routines"   value={routines.length} sub="scheduled"   icon={CalendarClock} color="text-primary"          ring="primary"  />
          <StatCard label="Active"     value={active}          sub="running"     icon={Activity}      color="text-success"          ring="success"  />
          <StatCard label="Total Runs" value={routines.reduce((a, r) => a + r.run_count, 0)} sub="all time" icon={CheckCircle} color="text-warning" ring="warning" />
          <StatCard label="Agents"     value={agents.length}   sub="from VPS"    icon={Bot}           color="text-muted-foreground" ring="muted"    />
        </StatGrid>

        {showAdd && (
          <AddRoutineForm agents={agents} skills={skills} companies={companies}
            onAdd={handleAdd} onClose={() => setShowAdd(false)} />
        )}

        {err && (
          <div className="flex items-center gap-3 p-4 rounded-xl border border-destructive/15 bg-destructive/5">
            <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
            <span className="text-[13px] text-destructive">{err}</span>
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3 text-muted-foreground/30" />
            <div className="text-[13px] text-muted-foreground">Loading routines…</div>
          </div>
        ) : routines.length === 0 ? (
          <EmptyState icon={CalendarClock} title="No routines yet" description="Schedule your first agent run to automate recurring tasks." />
        ) : (
          <div className={CARD.table}>
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  {['Routine', 'Agent', 'Schedule', 'Last Run', 'Avg', 'Runs', ''].map(h => (
                    <th key={h} className="text-left px-5 py-3.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.06em] bg-muted/30">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {routines.map(r => {
                  const agent = agents.find(a => a.id === r.paperclip_agent_id);
                  const company = companies.find(c => c.id === r.paperclip_company_id);
                  return (
                    <tr key={r.id} className={cn('border-b border-border/40 last:border-0 transition-colors', r.enabled ? 'hover:bg-muted/20' : 'opacity-50 hover:bg-muted/10')}>
                      <td className="px-5 py-4">
                        <div className="text-[14px] font-semibold text-card-foreground">{r.name}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">{company?.name ?? r.paperclip_company_id}</div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5 text-[13px] text-foreground">
                          <Bot className="w-3.5 h-3.5 text-muted-foreground" />
                          {agent?.name ?? <span className="text-muted-foreground/50 text-[11px]">{r.paperclip_agent_id.slice(0, 8)}…</span>}
                        </div>
                        {r.skill_slug && (
                          <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded mt-1 inline-block">{r.skill_slug}</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-mono text-[12px] text-foreground">{r.schedule}</div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="text-[13px] text-foreground">{fmtRelative(r.last_run_at)}</div>
                        {r.last_status && (
                          <div className={cn('flex items-center gap-1 text-[11px] mt-0.5',
                            r.last_status === 'success' ? 'text-success' : 'text-destructive')}>
                            {r.last_status === 'success'
                              ? <CheckCircle className="w-3 h-3" />
                              : <AlertTriangle className="w-3 h-3" />}
                            {r.last_status}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4 text-[13px] text-foreground tabular-nums">{fmtDuration(r.avg_duration_sec)}</td>
                      <td className="px-5 py-4 text-[13px] text-foreground tabular-nums">{r.run_count}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleRunNow(r.id)} disabled={!r.enabled || running === r.id}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-40">
                            {running === r.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                            Run
                          </button>
                          <button onClick={() => handleToggle(r.id, r.enabled)}
                            className="transition-colors">
                            {r.enabled
                              ? <ToggleRight className="w-6 h-6 text-success" />
                              : <ToggleLeft  className="w-6 h-6 text-muted-foreground/40" />}
                          </button>
                          <button onClick={() => handleDelete(r.id)}
                            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground/30 hover:text-destructive transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </PageBody>
    </PageLayout>
  );
}
