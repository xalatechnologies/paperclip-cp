'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  BrainCircuit, Plus, Trash2, RefreshCw, Bot, AlertTriangle,
  Star, Clock, Info, Zap, Archive, MessageSquare,
  Filter, ChevronDown,
} from 'lucide-react';
import { TEXT, LAYOUT, CARD } from '@/lib/tokens';
import { cn } from '@/lib/utils';
import {
  PageHeader, PageBody, PageLayout,
  StatCard, StatGrid,
  SidebarSection, SidebarDivider, SidebarRow,
  MiniProgressBar, EmptyState,
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

interface MemoryEntry {
  id: string;
  paperclip_agent_id: string;
  paperclip_company_id: string;
  type: 'fact' | 'summary' | 'preference' | 'error';
  content: string;
  source: string | null;
  importance: number;
  token_count: number;
  created_at: number;
  expires_at: number | null;
}

interface Budget {
  [agentId: string]: { count: number; tokens: number };
}

interface VpsAgent { id: string; name: string; role: string; company_id: string; company_name: string; }
interface VpsCompany { id: string; name: string; }

// ── Config ─────────────────────────────────────────────────────────────────

const TYPE_CFG = {
  fact:       { icon: Info,         color: 'text-primary',     bg: 'bg-primary/10',     label: 'Fact' },
  summary:    { icon: Archive,      color: 'text-chart-2',     bg: 'bg-chart-2/10',     label: 'Summary' },
  preference: { icon: Star,         color: 'text-warning',     bg: 'bg-warning/10',     label: 'Preference' },
  error:      { icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10', label: 'Error' },
};

function importanceLabel(n: number) {
  if (n >= 5) return { label: 'Critical', color: 'text-destructive' };
  if (n >= 4) return { label: 'High',     color: 'text-warning' };
  if (n >= 3) return { label: 'Normal',   color: 'text-muted-foreground' };
  return               { label: 'Low',     color: 'text-muted-foreground/50' };
}

function fmtDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Add Entry Form ─────────────────────────────────────────────────────────

function AddMemoryForm({ agents, companies, onAdd, onClose }: {
  agents: VpsAgent[]; companies: VpsCompany[];
  onAdd: (d: any) => Promise<void>; onClose: () => void;
}) {
  const [form, setForm] = useState({
    paperclip_company_id: companies[0]?.id ?? '',
    paperclip_agent_id: agents[0]?.id ?? '',
    type: 'fact' as const,
    content: '',
    source: '',
    importance: 3,
    expires_in_days: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const filteredAgents = form.paperclip_company_id
    ? agents.filter(a => a.company_id === form.paperclip_company_id)
    : agents;

  const submit = async () => {
    if (!form.content.trim() || !form.paperclip_agent_id) {
      setErr('Content and agent are required'); return;
    }
    setSaving(true); setErr(null);
    try {
      await onAdd({
        ...form,
        source: form.source || null,
        expires_in_days: form.expires_in_days ? parseInt(form.expires_in_days, 10) : undefined,
      });
      onClose();
    } catch (e: any) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-card border border-primary/20 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <h3 className="text-[14px] font-semibold">Add Memory Entry</h3>
        <button onClick={onClose} className="text-[18px] text-muted-foreground/40 hover:text-foreground">×</button>
      </div>
      <div className="p-5 grid grid-cols-3 gap-4">
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
            <option value="">— Select —</option>
            {filteredAgents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label className={cn(TEXT.label, 'block mb-1.5')}>Type</label>
          <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as any }))}
            className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2.5 text-[13px] text-foreground outline-none">
            {Object.entries(TYPE_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div className="col-span-3">
          <label className={cn(TEXT.label, 'block mb-1.5')}>Content</label>
          <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
            rows={3} placeholder="The memory entry content — facts, summaries, preferences, or error traces…"
            className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:ring-1 focus:ring-primary/40 resize-none" />
          <div className="text-[10px] text-muted-foreground mt-1">
            ~{Math.ceil(form.content.length / 4)} tokens
          </div>
        </div>
        <div>
          <label className={cn(TEXT.label, 'block mb-1.5')}>Source</label>
          <input value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
            placeholder="e.g. run-id, PR #247"
            className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/40 outline-none" />
        </div>
        <div>
          <label className={cn(TEXT.label, 'block mb-1.5')}>Importance (1–5)</label>
          <input type="number" min="1" max="5" value={form.importance}
            onChange={e => setForm(f => ({ ...f, importance: parseInt(e.target.value, 10) }))}
            className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2.5 text-[13px] text-foreground outline-none" />
        </div>
        <div>
          <label className={cn(TEXT.label, 'block mb-1.5')}>Expires in (days)</label>
          <input type="number" min="1" value={form.expires_in_days}
            onChange={e => setForm(f => ({ ...f, expires_in_days: e.target.value }))}
            placeholder="blank = permanent"
            className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/40 outline-none" />
        </div>
        {err && <div className="col-span-3 text-[12px] text-destructive">{err}</div>}
        <div className="col-span-3 flex justify-end gap-3 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-[13px] border border-border rounded-lg text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
          <button onClick={submit} disabled={saving || !form.content.trim()}
            className="flex items-center gap-2 px-5 py-2 text-[13px] font-semibold bg-primary/90 hover:bg-primary text-white rounded-lg transition-colors disabled:opacity-50">
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Add Entry
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
export default function MemoryPage() {
  const [entries, setEntries]   = useState<MemoryEntry[]>([]);
  const [budget, setBudget]     = useState<Budget>({});
  const [agents, setAgents]     = useState<VpsAgent[]>([]);
  const [companies, setCompanies] = useState<VpsCompany[]>([]);
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState<string | null>(null);
  const [showAdd, setShowAdd]   = useState(false);
  const [filterAgent, setFilterAgent] = useState('');
  const [filterType, setFilterType]   = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const params = new URLSearchParams();
      if (filterAgent) params.set('agent_id', filterAgent);
      const [mRes, aRes, cRes] = await Promise.all([
        fetch(`${API}/api/memory?${params}`, { headers: AUTH }),
        fetch(`${API}/api/control/agents`, { headers: AUTH }),
        fetch(`${API}/api/control/companies`, { headers: AUTH }),
      ]);
      const mData = mRes.ok ? await mRes.json().catch(() => ({})) : {};
      setEntries(Array.isArray(mData.entries) ? mData.entries : []);
      setBudget(mData.budget && typeof mData.budget === 'object' ? mData.budget : {});
      setAgents(await safeArr(aRes));
      setCompanies(await safeArr(cRes));
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, [filterAgent]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleAdd = async (data: any) => {
    const res = await fetch(`${API}/api/memory`, { method: 'POST', headers: AUTH, body: JSON.stringify(data) });
    if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
    await fetchAll();
  };

  const handleDelete = async (id: string) => {
    await fetch(`${API}/api/memory/${id}`, { method: 'DELETE', headers: AUTH });
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  const visible = entries.filter(e => !filterType || e.type === filterType);
  const totalTokens = Object.values(budget).reduce((a, b) => a + b.tokens, 0);
  const maxAgentTokens = Math.max(...Object.values(budget).map(b => b.tokens), 1);

  const sidebar = (
    <div className={LAYOUT.rightSidebar}>
      <SidebarSection title="Total Budget">
        <div className={cn(CARD.panel, 'text-center')}>
          <div className="text-[28px] font-bold text-card-foreground" style={{ letterSpacing: '-0.05em' }}>
            {totalTokens.toLocaleString()}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">tokens in memory</div>
        </div>
      </SidebarSection>
      <SidebarDivider />
      <SidebarSection title="Per-Agent Budget">
        {Object.entries(budget).map(([agentId, b]) => {
          const agent = agents.find(a => a.id === agentId);
          return (
            <div key={agentId} className="mb-3">
              <div className="flex justify-between mb-1">
                <span className="text-[11px] text-muted-foreground truncate max-w-[130px]">{agent?.name ?? agentId.slice(0, 8) + '…'}</span>
                <span className="text-[11px] font-semibold text-card-foreground tabular-nums">{b.tokens.toLocaleString()}</span>
              </div>
              <MiniProgressBar value={b.tokens} max={maxAgentTokens} colorClass="bg-primary/50" height="h-1.5" />
              <div className="text-[10px] text-muted-foreground mt-0.5">{b.count} entries</div>
            </div>
          );
        })}
        {Object.keys(budget).length === 0 && <div className="text-[12px] text-muted-foreground">No entries yet</div>}
      </SidebarSection>
      <SidebarDivider />
      <SidebarSection title="By Type">
        {Object.entries(TYPE_CFG).map(([k, v]) => {
          const count = entries.filter(e => e.type === k).length;
          return (
            <div key={k} className="flex items-center gap-2 py-0.5">
              <v.icon className={cn('w-3.5 h-3.5 flex-shrink-0', v.color)} strokeWidth={2} />
              <span className="text-[12px] text-foreground flex-1">{v.label}</span>
              <span className="text-[12px] font-semibold text-card-foreground">{count}</span>
            </div>
          );
        })}
      </SidebarSection>
    </div>
  );

  return (
    <PageLayout sidebar={sidebar}>
      <PageHeader
        title="Memory"
        subtitle="Per-agent memory store · context-budgeted · fact · summary · preference · error"
        badge={
          <div className="flex items-center gap-2">
            <button onClick={fetchAll} disabled={loading}
              className="p-2 rounded-lg border border-border bg-card hover:bg-muted transition-colors disabled:opacity-40">
              <RefreshCw className={cn('w-4 h-4 text-muted-foreground', loading && 'animate-spin')} />
            </button>
            <button onClick={() => setShowAdd(v => !v)}
              className="flex items-center gap-2 px-4 py-2 text-[13px] font-semibold rounded-lg bg-primary/90 hover:bg-primary text-white transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add Entry
            </button>
          </div>
        }
      />
      <PageBody>
        <StatGrid cols={4}>
          <StatCard label="Entries"    value={entries.length}                 sub="memory items"   icon={BrainCircuit} color="text-primary"          ring="primary" />
          <StatCard label="Tokens"     value={totalTokens.toLocaleString()}   sub="total stored"   icon={Zap}          color="text-warning"          ring="warning" />
          <StatCard label="Agents"     value={Object.keys(budget).length}     sub="with memory"    icon={Bot}          color="text-success"          ring="success" />
          <StatCard label="Permanent"  value={entries.filter(e => !e.expires_at).length} sub="no expiry" icon={Archive} color="text-muted-foreground" ring="muted" />
        </StatGrid>

        {showAdd && (
          <AddMemoryForm agents={agents} companies={companies} onAdd={handleAdd} onClose={() => setShowAdd(false)} />
        )}

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <Filter className="w-3.5 h-3.5" /> Filter:
          </div>
          <select value={filterAgent} onChange={e => setFilterAgent(e.target.value)}
            className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-[12px] text-foreground outline-none">
            <option value="">All agents</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-[12px] text-foreground outline-none">
            <option value="">All types</option>
            {Object.entries(TYPE_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          {(filterAgent || filterType) && (
            <button onClick={() => { setFilterAgent(''); setFilterType(''); }}
              className="text-[12px] text-primary hover:underline">Clear</button>
          )}
        </div>

        {err && (
          <div className="flex items-center gap-3 p-4 rounded-xl border border-destructive/15 bg-destructive/5">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            <span className="text-[13px] text-destructive">{err}</span>
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3 text-muted-foreground/30" />
          </div>
        ) : visible.length === 0 ? (
          <EmptyState icon={BrainCircuit} title="No memory entries" description="Add facts, summaries, preferences, and error traces that agents can recall at runtime." />
        ) : (
          <div className="space-y-2">
            {visible.map(entry => {
              const cfg = TYPE_CFG[entry.type] ?? TYPE_CFG.fact;
              const imp = importanceLabel(entry.importance);
              const agent = agents.find(a => a.id === entry.paperclip_agent_id);
              return (
                <div key={entry.id} className={cn(CARD.base, 'p-4 flex gap-4 group hover:shadow-sm transition-shadow')}>
                  <div className={cn('p-2 rounded-lg ring-1 flex-shrink-0 h-fit', cfg.bg,
                    `ring-${cfg.color.replace('text-', '')}/20`)}>
                    <cfg.icon className={cn('w-4 h-4', cfg.color)} strokeWidth={2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-md', cfg.bg, cfg.color)}>{cfg.label}</span>
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Bot className="w-3 h-3" />
                        {agent?.name ?? entry.paperclip_agent_id.slice(0, 8) + '…'}
                      </div>
                      <span className={cn('text-[11px] font-medium', imp.color)}>
                        {'★'.repeat(entry.importance)}{'☆'.repeat(5 - entry.importance)} {imp.label}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground/50">{entry.token_count} tok</span>
                      {entry.source && (
                        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{entry.source}</span>
                      )}
                      {entry.expires_at && (
                        <div className="flex items-center gap-1 text-[10px] text-warning">
                          <Clock className="w-3 h-3" />
                          Expires {fmtDate(entry.expires_at)}
                        </div>
                      )}
                    </div>
                    <p className="text-[13px] text-foreground leading-relaxed">{entry.content}</p>
                    <div className="text-[10px] text-muted-foreground/40 mt-1">{fmtDate(entry.created_at)}</div>
                  </div>
                  <button onClick={() => handleDelete(entry.id)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-all flex-shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </PageBody>
    </PageLayout>
  );
}
