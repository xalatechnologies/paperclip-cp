'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  SlidersHorizontal, Plus, Trash2, RefreshCw, Bot,
  AlertTriangle, ToggleRight, ToggleLeft, Zap,
  Database, BrainCircuit, Shield, ArrowUp, ArrowDown,
  Eye, ChevronRight,
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

interface ContextRule {
  id: string;
  paperclip_agent_id: string;
  paperclip_company_id: string;
  rule_type: string;
  label: string;
  config: Record<string, unknown>;
  enabled: number;
  priority: number;
  created_at: number;
}

interface Snapshot {
  agent_id: string;
  max_tokens: number;
  total_tokens: number;
  utilization_pct: number;
  breakdown: {
    memory:    { tokens: number; entries: number };
    knowledge: { tokens: number; documents: number };
  };
  memory: any[];
  knowledge: any[];
  rules: any[];
}

interface VpsAgent { id: string; name: string; role: string; company_id: string; company_name: string; }
interface VpsCompany { id: string; name: string; }

// ── Rule type config ──────────────────────────────────────────────────────

const RULE_TYPES = {
  budget:    { icon: Shield,       color: 'text-destructive', bg: 'bg-destructive/10', label: 'Budget Cap',       desc: 'Max tokens from memory & knowledge' },
  injection: { icon: ArrowDown,    color: 'text-primary',     bg: 'bg-primary/10',     label: 'Injection Order',  desc: 'Control what goes into context first' },
  trim:      { icon: Zap,          color: 'text-warning',     bg: 'bg-warning/10',     label: 'Trim Strategy',    desc: 'How to compress when over budget' },
  knowledge: { icon: Database,     color: 'text-chart-2',     bg: 'bg-chart-2/10',     label: 'Knowledge Filter', desc: 'Which collections are injected' },
  memory:    { icon: BrainCircuit, color: 'text-success',     bg: 'bg-success/10',     label: 'Memory Filter',    desc: 'Min importance & type filters' },
};

// ── Default configs for rule types ────────────────────────────────────────

const DEFAULT_CONFIGS: Record<string, Record<string, unknown>> = {
  budget:    { max_tokens: 8000, memory_max_tokens: 2400, knowledge_max_tokens: 4000, min_importance: 2 },
  injection: { order: ['knowledge', 'memory'], system_prompt_first: true },
  trim:      { strategy: 'importance_first', min_importance_to_keep: 3 },
  knowledge: { collection_ids: [], max_chunks: 20 },
  memory:    { min_importance: 2, types: ['fact', 'summary', 'preference'] },
};

// ── Add Rule Form ─────────────────────────────────────────────────────────

function AddRuleForm({ agents, companies, onAdd, onClose }: {
  agents: VpsAgent[]; companies: VpsCompany[];
  onAdd: (d: any) => Promise<void>; onClose: () => void;
}) {
  const [form, setForm] = useState({
    paperclip_company_id: companies[0]?.id ?? '',
    paperclip_agent_id: agents[0]?.id ?? '',
    rule_type: 'budget',
    label: '',
    priority: 5,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const filteredAgents = form.paperclip_company_id
    ? agents.filter(a => a.company_id === form.paperclip_company_id)
    : agents;

  const rtCfg = RULE_TYPES[form.rule_type as keyof typeof RULE_TYPES];

  const submit = async () => {
    if (!form.paperclip_agent_id || !form.label.trim()) { setErr('Agent and label required'); return; }
    setSaving(true); setErr(null);
    try {
      await onAdd({
        ...form,
        config: DEFAULT_CONFIGS[form.rule_type] ?? {},
        enabled: true,
      });
      onClose();
    } catch (e: any) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-card border border-primary/20 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <h3 className="text-[14px] font-semibold">Add Context Rule</h3>
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
          <label className={cn(TEXT.label, 'block mb-1.5')}>Rule Type</label>
          <select value={form.rule_type} onChange={e => setForm(f => ({ ...f, rule_type: e.target.value }))}
            className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2.5 text-[13px] text-foreground outline-none">
            {Object.entries(RULE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        {rtCfg && (
          <div className="col-span-3 flex items-center gap-2.5 p-3 rounded-lg bg-muted/30 border border-border">
            <rtCfg.icon className={cn('w-4 h-4 flex-shrink-0', rtCfg.color)} strokeWidth={2} />
            <div>
              <div className="text-[12px] font-semibold text-card-foreground">{rtCfg.label}</div>
              <div className="text-[11px] text-muted-foreground">{rtCfg.desc}</div>
            </div>
          </div>
        )}
        <div className="col-span-2">
          <label className={cn(TEXT.label, 'block mb-1.5')}>Label</label>
          <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
            placeholder={`e.g. ${form.rule_type === 'budget' ? '8K token cap' : 'knowledge first injection'}`}
            className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:ring-1 focus:ring-primary/40" />
        </div>
        <div>
          <label className={cn(TEXT.label, 'block mb-1.5')}>Priority (1–10)</label>
          <input type="number" min="1" max="10" value={form.priority}
            onChange={e => setForm(f => ({ ...f, priority: parseInt(e.target.value, 10) }))}
            className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2.5 text-[13px] text-foreground outline-none" />
        </div>
        <div className="col-span-3">
          <label className={cn(TEXT.label, 'block mb-1.5')}>Default Config (JSON)</label>
          <div className="bg-muted/20 border border-border/50 rounded-lg p-3 font-mono text-[11px] text-muted-foreground overflow-auto max-h-24">
            {JSON.stringify(DEFAULT_CONFIGS[form.rule_type] ?? {}, null, 2)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">Config is set to sensible defaults. Edit via API after creation.</div>
        </div>
        {err && <div className="col-span-3 text-[12px] text-destructive">{err}</div>}
        <div className="col-span-3 flex justify-end gap-3 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-[13px] border border-border rounded-lg text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
          <button onClick={submit} disabled={saving || !form.label.trim() || !form.paperclip_agent_id}
            className="flex items-center gap-2 px-5 py-2 text-[13px] font-semibold bg-primary/90 hover:bg-primary text-white rounded-lg transition-colors disabled:opacity-50">
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Add Rule
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Context Snapshot Panel ─────────────────────────────────────────────────

function SnapshotPanel({ agentId, agents }: { agentId: string; agents: VpsAgent[] }) {
  const [snap, setSnap]   = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [maxTok, setMaxTok]   = useState(8000);

  const load = async () => {
    setLoading(true);
    const res = await fetch(`${API}/api/context/snapshot/${agentId}?max_tokens=${maxTok}`, { headers: AUTH });
    setSnap(await res.json());
    setLoading(false);
  };

  const agent = agents.find(a => a.id === agentId);

  return (
    <div className={cn(CARD.base, 'p-5')}>
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-primary/10 ring-1 ring-primary/20">
          <Eye className="w-4 h-4 text-primary" strokeWidth={2} />
        </div>
        <div className="flex-1">
          <div className="text-[14px] font-semibold text-card-foreground">Context Snapshot</div>
          <div className="text-[11px] text-muted-foreground">{agent?.name ?? agentId}</div>
        </div>
        <div className="flex items-center gap-2">
          <input type="number" value={maxTok} onChange={e => setMaxTok(parseInt(e.target.value, 10))}
            className="w-20 bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-[12px] text-foreground outline-none text-right" />
          <span className="text-[11px] text-muted-foreground">max tok</span>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-primary/10 hover:bg-primary/20 text-primary rounded-lg transition-colors disabled:opacity-40">
            {loading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
            Preview
          </button>
        </div>
      </div>
      {snap && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all"
                style={{
                  width: `${snap.utilization_pct}%`,
                  background: snap.utilization_pct > 90 ? 'var(--color-destructive)' :
                              snap.utilization_pct > 70 ? 'var(--color-warning)' : 'var(--color-success)',
                }} />
            </div>
            <span className={cn('text-[13px] font-bold tabular-nums',
              snap.utilization_pct > 90 ? 'text-destructive' :
              snap.utilization_pct > 70 ? 'text-warning' : 'text-success')}>
              {snap.utilization_pct}%
            </span>
            <span className="text-[12px] text-muted-foreground">{snap.total_tokens.toLocaleString()} / {snap.max_tokens.toLocaleString()} tok</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-muted/30 border border-border">
              <div className="text-[11px] text-muted-foreground mb-1 flex items-center gap-1.5">
                <BrainCircuit className="w-3 h-3" /> Memory
              </div>
              <div className="text-[22px] font-bold text-card-foreground" style={{ letterSpacing: '-0.04em' }}>
                {snap.breakdown.memory.tokens.toLocaleString()}
              </div>
              <div className="text-[11px] text-muted-foreground">{snap.breakdown.memory.entries} entries</div>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 border border-border">
              <div className="text-[11px] text-muted-foreground mb-1 flex items-center gap-1.5">
                <Database className="w-3 h-3" /> Knowledge
              </div>
              <div className="text-[22px] font-bold text-card-foreground" style={{ letterSpacing: '-0.04em' }}>
                {snap.breakdown.knowledge.tokens.toLocaleString()}
              </div>
              <div className="text-[11px] text-muted-foreground">{snap.breakdown.knowledge.documents} docs</div>
            </div>
          </div>
          {snap.rules.length > 0 && (
            <div>
              <div className={cn(TEXT.label, 'mb-2')}>Active Rules</div>
              <div className="space-y-1">
                {snap.rules.map(r => (
                  <div key={r.id} className="flex items-center gap-2 text-[12px] text-foreground">
                    <ChevronRight className="w-3 h-3 text-primary/40" />
                    <span className="font-medium">{r.label}</span>
                    <span className="text-muted-foreground">({r.type})</span>
                    <span className="text-[10px] text-muted-foreground/50 ml-auto">p{r.priority}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
export default function ContextPage() {
  const [rules, setRules]         = useState<ContextRule[]>([]);
  const [agents, setAgents]       = useState<VpsAgent[]>([]);
  const [companies, setCompanies] = useState<VpsCompany[]>([]);
  const [loading, setLoading]     = useState(true);
  const [err, setErr]             = useState<string | null>(null);
  const [showAdd, setShowAdd]     = useState(false);
  const [filterAgent, setFilterAgent] = useState('');
  const [previewAgent, setPreviewAgent] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [rRes, aRes, cRes] = await Promise.all([
        fetch(`${API}/api/context${filterAgent ? `?agent_id=${filterAgent}` : ''}`, { headers: AUTH }),
        fetch(`${API}/api/control/agents`, { headers: AUTH }),
        fetch(`${API}/api/control/companies`, { headers: AUTH }),
      ]);
      setRules(await safeArr(rRes));
      setAgents(await safeArr(aRes));
      setCompanies(await safeArr(cRes));
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, [filterAgent]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleAdd = async (data: any) => {
    const res = await fetch(`${API}/api/context`, { method: 'POST', headers: AUTH, body: JSON.stringify(data) });
    if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
    await fetchAll();
  };

  const handleToggle = async (id: string, enabled: number) => {
    await fetch(`${API}/api/context/${id}/toggle`, {
      method: 'PATCH', headers: AUTH, body: JSON.stringify({ enabled: !enabled }),
    });
    setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: enabled ? 0 : 1 } : r));
  };

  const handleDelete = async (id: string) => {
    await fetch(`${API}/api/context/${id}`, { method: 'DELETE', headers: AUTH });
    setRules(prev => prev.filter(r => r.id !== id));
  };

  const agentsWithRules = [...new Set(rules.map(r => r.paperclip_agent_id))];

  const sidebar = (
    <div className={LAYOUT.rightSidebar}>
      <SidebarSection title="Overview">
        <SidebarRow label="Total rules"  value={rules.length} />
        <SidebarRow label="Active"       value={rules.filter(r => r.enabled).length} valueClass="text-success" />
        <SidebarRow label="Agents"       value={agentsWithRules.length} />
      </SidebarSection>
      <SidebarDivider />
      <SidebarSection title="Rule Types">
        {Object.entries(RULE_TYPES).map(([k, v]) => {
          const count = rules.filter(r => r.rule_type === k).length;
          return (
            <div key={k} className="flex items-center gap-2 py-0.5">
              <v.icon className={cn('w-3.5 h-3.5', v.color)} strokeWidth={2} />
              <span className="text-[12px] text-foreground flex-1">{v.label}</span>
              <span className="text-[12px] font-semibold">{count}</span>
            </div>
          );
        })}
      </SidebarSection>
      <SidebarDivider />
      <SidebarSection title="What's Context Eng.?">
        <div className="p-3 rounded-lg bg-muted/30 border border-border text-[11px] text-muted-foreground leading-relaxed space-y-2">
          <p>Rules control what each agent sees in its context window before every run:</p>
          <p><span className="text-foreground font-semibold">Budget Cap</span> — max tokens from memory + knowledge</p>
          <p><span className="text-foreground font-semibold">Injection Order</span> — knowledge before memory, or vice versa</p>
          <p><span className="text-foreground font-semibold">Trim Strategy</span> — drop low-importance entries first</p>
          <p><span className="text-foreground font-semibold">Memory/Knowledge Filter</span> — type or collection restrictions</p>
        </div>
      </SidebarSection>
    </div>
  );

  return (
    <PageLayout sidebar={sidebar}>
      <PageHeader
        title="Context Engineering"
        subtitle="Per-agent context rules · token budgets · injection order · trim strategies"
        badge={
          <div className="flex items-center gap-2">
            <button onClick={fetchAll} disabled={loading}
              className="p-2 rounded-lg border border-border bg-card hover:bg-muted transition-colors disabled:opacity-40">
              <RefreshCw className={cn('w-4 h-4 text-muted-foreground', loading && 'animate-spin')} />
            </button>
            <button onClick={() => setShowAdd(v => !v)}
              className="flex items-center gap-2 px-4 py-2 text-[13px] font-semibold rounded-lg bg-primary/90 hover:bg-primary text-white transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add Rule
            </button>
          </div>
        }
      />
      <PageBody>
        <StatGrid cols={4}>
          <StatCard label="Rules"    value={rules.length}                            sub="total"   icon={SlidersHorizontal} color="text-primary"      ring="primary"  />
          <StatCard label="Active"   value={rules.filter(r => r.enabled).length}     sub="enabled" icon={Zap}               color="text-success"      ring="success"  />
          <StatCard label="Agents"   value={agentsWithRules.length}                  sub="covered" icon={Bot}               color="text-chart-2"      ring="chart2"   />
          <StatCard label="Types"    value={Object.keys(RULE_TYPES).length}          sub="available" icon={Shield}          color="text-muted-foreground" ring="muted" />
        </StatGrid>

        {showAdd && (
          <AddRuleForm agents={agents} companies={companies} onAdd={handleAdd} onClose={() => setShowAdd(false)} />
        )}

        {err && (
          <div className="flex items-center gap-3 p-4 rounded-xl border border-destructive/15 bg-destructive/5">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            <span className="text-[13px] text-destructive">{err}</span>
          </div>
        )}

        {/* Context snapshot preview */}
        <div className={cn(CARD.base, 'p-5')}>
          <div className="flex items-center gap-3 mb-3">
            <Eye className="w-4 h-4 text-primary" />
            <h3 className="text-[14px] font-semibold text-card-foreground">Agent Context Preview</h3>
          </div>
          <div className="flex items-center gap-3 mb-4">
            <select value={previewAgent} onChange={e => setPreviewAgent(e.target.value)}
              className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-[13px] text-foreground outline-none flex-1">
              <option value="">— Select agent to preview context —</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name} ({a.company_name ?? ''})</option>)}
            </select>
          </div>
          {previewAgent && <SnapshotPanel agentId={previewAgent} agents={agents} />}
        </div>

        {/* Rules table */}
        {loading ? (
          <div className="py-16 text-center">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3 text-muted-foreground/30" />
          </div>
        ) : rules.length === 0 ? (
          <EmptyState icon={SlidersHorizontal} title="No context rules" description="Add rules to control how memory and knowledge are injected into each agent's context window." />
        ) : (
          <div className={CARD.table}>
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  {['Rule', 'Agent', 'Config', 'Priority', 'Status', ''].map(h => (
                    <th key={h} className="text-left px-5 py-3.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.06em] bg-muted/30">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rules.map(rule => {
                  const rtCfg = RULE_TYPES[rule.rule_type as keyof typeof RULE_TYPES];
                  const agent = agents.find(a => a.id === rule.paperclip_agent_id);
                  return (
                    <tr key={rule.id} className={cn('border-b border-border/40 last:border-0 transition-colors', rule.enabled ? 'hover:bg-muted/20' : 'opacity-50')}>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2.5">
                          {rtCfg && <rtCfg.icon className={cn('w-4 h-4 flex-shrink-0', rtCfg.color)} strokeWidth={2} />}
                          <div>
                            <div className="text-[13px] font-semibold text-card-foreground">{rule.label}</div>
                            <div className={cn('text-[11px] px-1.5 py-0.5 rounded mt-0.5 inline-block', rtCfg?.bg, rtCfg?.color)}>
                              {rtCfg?.label ?? rule.rule_type}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5 text-[13px] text-foreground">
                          <Bot className="w-3.5 h-3.5 text-muted-foreground" />
                          {agent?.name ?? rule.paperclip_agent_id.slice(0, 8) + '…'}
                        </div>
                        <div className="text-[10px] text-muted-foreground">{agent?.company_name ?? ''}</div>
                      </td>
                      <td className="px-5 py-4 max-w-[200px]">
                        <div className="font-mono text-[10px] text-muted-foreground bg-muted/40 rounded px-2 py-1 overflow-hidden truncate">
                          {JSON.stringify(rule.config)}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-mono text-[13px] text-foreground">{rule.priority}</span>
                      </td>
                      <td className="px-5 py-4">
                        <button onClick={() => handleToggle(rule.id, rule.enabled)} className="transition-colors">
                          {rule.enabled
                            ? <ToggleRight className="w-6 h-6 text-success" />
                            : <ToggleLeft  className="w-6 h-6 text-muted-foreground/40" />}
                        </button>
                      </td>
                      <td className="px-5 py-4">
                        <button onClick={() => handleDelete(rule.id)}
                          className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground/30 hover:text-destructive transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
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
