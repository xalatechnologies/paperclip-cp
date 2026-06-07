'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Plug, Plus, RefreshCw, Trash2, ToggleLeft, ToggleRight,
  Github, Slack, MessageSquare, Target, CheckCircle,
  AlertTriangle, Send, Globe, ChevronDown, ChevronUp,
  Bell, Zap,
} from 'lucide-react';
import { TEXT, LAYOUT, CARD } from '@/lib/tokens';
import { cn } from '@/lib/utils';
import {
  PageHeader, PageBody, PageLayout, StatCard, StatGrid,
  SidebarSection, SidebarDivider, SidebarRow,
  StatusBadge,
} from '@/components/ui';

const API  = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const KEY  = process.env.NEXT_PUBLIC_CONTROL_CENTER_API_KEY ?? '';
const AUTH = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

// ── Types ─────────────────────────────────────────────────────────────────

interface Channel {
  id: string;
  name: string;
  type: 'slack' | 'teams' | 'webhook' | 'email';
  enabled: boolean;
  paperclip_company_id: string | null;
  events: string[];
  created_at: number;
}

// ── Integration catalog ───────────────────────────────────────────────────

const INTEGRATION_TYPES: Array<{
  id: 'slack' | 'teams' | 'webhook' | 'email';
  label: string;
  icon: React.ElementType;
  color: string;
  ring: string;
  bg: string;
  desc: string;
  placeholder: string;
  configKey: string;
  configLabel: string;
  phase: string;
}> = [
  {
    id: 'slack', label: 'Slack', icon: Slack, color: 'text-[#4A154B]',
    ring: 'ring-[#4A154B]/20', bg: 'bg-[#4A154B]/8',
    desc: 'Post agent events, errors, and cost alerts to a Slack channel via webhook.',
    placeholder: 'https://hooks.slack.com/services/…',
    configKey: 'webhook_url', configLabel: 'Webhook URL',
    phase: 'Phase 3',
  },
  {
    id: 'teams', label: 'Microsoft Teams', icon: MessageSquare, color: 'text-[#6264A7]',
    ring: 'ring-[#6264A7]/20', bg: 'bg-[#6264A7]/8',
    desc: 'Send notifications to a Teams channel via incoming webhook.',
    placeholder: 'https://outlook.office.com/webhook/…',
    configKey: 'webhook_url', configLabel: 'Webhook URL',
    phase: 'Phase 3',
  },
  {
    id: 'webhook', label: 'Custom Webhook', icon: Globe, color: 'text-primary',
    ring: 'ring-primary/20', bg: 'bg-primary/8',
    desc: 'POST events to any HTTPS endpoint as JSON.',
    placeholder: 'https://your-server.com/hooks/paperclip',
    configKey: 'url', configLabel: 'Endpoint URL',
    phase: 'Phase 3',
  },
  {
    id: 'email', label: 'Email', icon: Bell, color: 'text-warning',
    ring: 'ring-warning/20', bg: 'bg-warning/8',
    desc: 'Receive email digests and critical alerts.',
    placeholder: 'ops@yourcompany.com',
    configKey: 'to', configLabel: 'To address',
    phase: 'Phase 3',
  },
];

const GITHUB_INFO = {
  label: 'GitHub', icon: Github, color: 'text-foreground',
  ring: 'ring-border', bg: 'bg-muted/40',
  desc: 'Auto-create issues and PRs from agent task completions. Connect via repo token.',
  phase: 'Phase 3',
};

const LINEAR_INFO = {
  label: 'Linear', icon: Target, color: 'text-[#5E6AD2]',
  ring: 'ring-[#5E6AD2]/20', bg: 'bg-[#5E6AD2]/8',
  desc: 'Sync goals and agent task assignments bidirectionally with Linear projects.',
  phase: 'Phase 3',
};

const ALL_EVENTS = [
  'agent.error', 'agent.started', 'agent.completed',
  'budget.warn', 'budget.exceeded',
  'skill.pushed', 'secret.used',
  'heartbeat.missed',
];

// ── Helpers ───────────────────────────────────────────────────────────────

function typeIcon(type: string) {
  return INTEGRATION_TYPES.find(t => t.id === type) ?? INTEGRATION_TYPES[2];
}

function fmtDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ══════════════════════════════════════════════════════════════════════════
export default function IntegrationsPage() {
  const [channels, setChannels]     = useState<Channel[]>([]);
  const [loading, setLoading]       = useState(true);
  const [err, setErr]               = useState<string | null>(null);

  // Add form
  const [showAdd, setShowAdd]       = useState(false);
  const [addType, setAddType]       = useState<'slack' | 'teams' | 'webhook' | 'email'>('slack');
  const [addName, setAddName]       = useState('');
  const [addConfig, setAddConfig]   = useState('');
  const [addEvents, setAddEvents]   = useState<string[]>(['agent.error', 'budget.exceeded']);
  const [adding, setAdding]         = useState(false);
  const [addErr, setAddErr]         = useState<string | null>(null);
  const [testingId, setTestingId]   = useState<string | null>(null);

  const fetchChannels = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await fetch(`${API}/api/notifications`, { headers: AUTH });
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      setChannels(Array.isArray(json) ? json : (json.data ?? []));
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchChannels(); }, [fetchChannels]);

  const toggleEvent = (ev: string) => {
    setAddEvents(prev => prev.includes(ev) ? prev.filter(e => e !== ev) : [...prev, ev]);
  };

  const handleAdd = async () => {
    if (!addName.trim() || !addConfig.trim()) return;
    const cfg = typeIcon(addType);
    setAdding(true); setAddErr(null);
    try {
      const res = await fetch(`${API}/api/notifications`, {
        method: 'POST',
        headers: AUTH,
        body: JSON.stringify({
          name: addName,
          type: addType,
          config: { [cfg.configKey]: addConfig },
          events: addEvents,
          enabled: true,
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error ?? `${res.status}`);
      }
      setShowAdd(false);
      setAddName(''); setAddConfig(''); setAddEvents(['agent.error', 'budget.exceeded']);
      await fetchChannels();
    } catch (e: any) { setAddErr(e.message); }
    finally { setAdding(false); }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await fetch(`${API}/api/notifications/${id}/toggle`, {
        method: 'PATCH', headers: AUTH,
        body: JSON.stringify({ enabled: !enabled }),
      });
      setChannels(prev => prev.map(c => c.id === id ? { ...c, enabled: !enabled } : c));
    } catch { /* silent */ }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this integration?')) return;
    try {
      await fetch(`${API}/api/notifications/${id}`, { method: 'DELETE', headers: AUTH });
      setChannels(prev => prev.filter(c => c.id !== id));
    } catch { /* silent */ }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      await fetch(`${API}/api/notifications/${id}/test`, { method: 'POST', headers: AUTH });
      setTimeout(() => setTestingId(null), 2000);
    } catch { setTestingId(null); }
  };

  const selectedType = INTEGRATION_TYPES.find(t => t.id === addType)!;
  const activeCount  = channels.filter(c => c.enabled).length;

  const sidebar = (
    <div className={LAYOUT.rightSidebar}>
      <SidebarSection title="Overview">
        <SidebarRow label="Total channels" value={channels.length} />
        <SidebarRow label="Active"         value={activeCount}     valueClass="text-success" />
        <SidebarRow label="Disabled"       value={channels.length - activeCount} />
      </SidebarSection>

      <SidebarDivider />

      <SidebarSection title="By Type">
        {(['slack', 'teams', 'webhook', 'email'] as const).map(t => {
          const count = channels.filter(c => c.type === t).length;
          const info  = typeIcon(t);
          return (
            <div key={t} className="flex items-center gap-2 py-0.5">
              <info.icon className={cn('w-3.5 h-3.5 flex-shrink-0', info.color)} strokeWidth={2} />
              <span className="text-[12px] text-foreground flex-1 capitalize">{t}</span>
              <span className="text-[12px] font-semibold text-card-foreground">{count}</span>
            </div>
          );
        })}
      </SidebarSection>

      <SidebarDivider />

      <SidebarSection title="Roadmap Integrations">
        {[GITHUB_INFO, LINEAR_INFO].map(info => (
          <div key={info.label} className={cn('flex items-center gap-2.5 px-3 py-2.5 rounded-lg border', info.ring)}>
            <div className={cn('p-1.5 rounded ring-1 flex-shrink-0', info.ring, info.bg)}>
              <info.icon className={cn('w-3.5 h-3.5', info.color)} strokeWidth={2} />
            </div>
            <div>
              <div className="text-[12px] font-semibold text-card-foreground">{info.label}</div>
              <div className="text-[10px] text-muted-foreground">{info.phase}</div>
            </div>
          </div>
        ))}
      </SidebarSection>

      <SidebarDivider />

      <SidebarSection title="Event Types">
        <div className="space-y-1">
          {ALL_EVENTS.map(ev => (
            <div key={ev} className="font-mono text-[11px] text-muted-foreground py-0.5">{ev}</div>
          ))}
        </div>
      </SidebarSection>
    </div>
  );

  return (
    <PageLayout sidebar={sidebar}>
      <PageHeader
        title="Integrations"
        subtitle="Slack · Teams · Webhooks · GitHub · Linear"
        badge={
          <button
            onClick={() => setShowAdd(v => !v)}
            className="flex items-center gap-2 px-4 py-2 text-[13px] font-semibold rounded-lg bg-primary/90 hover:bg-primary text-white transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Channel
          </button>
        }
      />
      <PageBody>

        {/* Stats */}
        <StatGrid cols={4}>
          <StatCard label="Total"    value={channels.length} sub="notification channels" icon={Plug}         color="text-primary"   ring="primary"  />
          <StatCard label="Active"   value={activeCount}     sub="sending events"        icon={CheckCircle}   color="text-success"   ring="success"  />
          <StatCard label="Events"   value={ALL_EVENTS.length} sub="supported types"    icon={Zap}           color="text-warning"   ring="warning"  />
          <StatCard label="Disabled" value={channels.length - activeCount} sub="paused"   icon={AlertTriangle} color="text-muted-foreground" ring="muted" />
        </StatGrid>

        {/* Add Channel form */}
        {showAdd && (
          <div className="bg-card border border-primary/20 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h3 className="text-[14px] font-semibold text-card-foreground">New Notification Channel</h3>
              <button onClick={() => setShowAdd(false)} className="text-muted-foreground/50 hover:text-foreground transition-colors">
                <ChevronUp className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Type selector */}
              <div>
                <div className={cn(TEXT.label, 'mb-2')}>Type</div>
                <div className="grid grid-cols-4 gap-2">
                  {INTEGRATION_TYPES.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setAddType(t.id)}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2.5 rounded-lg border text-[12px] font-medium transition-all',
                        addType === t.id
                          ? `${t.ring} ${t.bg} ring-1 ${t.color}`
                          : 'border-border bg-muted/20 text-muted-foreground hover:bg-muted/40'
                      )}
                    >
                      <t.icon className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2} />
                      {t.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">{selectedType.desc}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Name */}
                <div>
                  <label className={cn(TEXT.label, 'block mb-1.5')}>Channel Name</label>
                  <input
                    value={addName}
                    onChange={e => setAddName(e.target.value)}
                    placeholder="e.g. #paperclip-alerts"
                    className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:ring-1 focus:ring-primary/40 transition"
                  />
                </div>
                {/* Config */}
                <div>
                  <label className={cn(TEXT.label, 'block mb-1.5')}>{selectedType.configLabel}</label>
                  <input
                    value={addConfig}
                    onChange={e => setAddConfig(e.target.value)}
                    placeholder={selectedType.placeholder}
                    className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:ring-1 focus:ring-primary/40 transition"
                  />
                </div>
              </div>

              {/* Events */}
              <div>
                <div className={cn(TEXT.label, 'mb-2')}>Subscribe to Events</div>
                <div className="flex flex-wrap gap-2">
                  {ALL_EVENTS.map(ev => (
                    <button
                      key={ev}
                      onClick={() => toggleEvent(ev)}
                      className={cn(
                        'px-2.5 py-1 rounded-md font-mono text-[11px] border transition-all',
                        addEvents.includes(ev)
                          ? 'bg-primary/10 border-primary/30 text-primary'
                          : 'bg-muted/20 border-border text-muted-foreground hover:border-border/80'
                      )}
                    >
                      {ev}
                    </button>
                  ))}
                </div>
              </div>

              {addErr && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/5 border border-destructive/20 text-destructive text-[12px]">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  {addErr}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-1">
                <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-[13px] font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleAdd}
                  disabled={adding || !addName.trim() || !addConfig.trim()}
                  className="flex items-center gap-2 px-5 py-2 text-[13px] font-semibold bg-primary/90 hover:bg-primary text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {adding ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Add Channel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Channel list */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className={TEXT.sectionTitle}>
              Notification Channels
              {channels.length > 0 && <span className="ml-2 text-[12px] text-muted-foreground font-normal">({channels.length})</span>}
            </h2>
            <button onClick={fetchChannels} disabled={loading}
              className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors">
              <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} /> Refresh
            </button>
          </div>

          {err && (
            <div className="flex items-center gap-3 p-4 rounded-xl border border-destructive/15 bg-destructive/5 mb-4">
              <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
              <span className="text-[13px] text-destructive">Failed to load: {err}</span>
            </div>
          )}

          {loading ? (
            <div className={cn(CARD.table, 'py-12 text-center')}>
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3 text-muted-foreground/30" />
              <div className="text-[13px] text-muted-foreground">Loading channels…</div>
            </div>
          ) : channels.length === 0 ? (
            <div className={cn(CARD.table, 'py-16 text-center')}>
              <Plug size={28} className="text-muted-foreground/15 mx-auto mb-3" />
              <div className="text-[15px] font-medium text-muted-foreground">No channels configured</div>
              <p className="text-[13px] text-muted-foreground/60 mt-1 max-w-xs mx-auto">
                Add your first notification channel to start receiving agent alerts
              </p>
              <button onClick={() => setShowAdd(true)}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-[13px] font-semibold bg-primary/90 hover:bg-primary text-white rounded-lg transition-colors">
                <Plus className="w-3.5 h-3.5" /> Add Channel
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {channels.map(ch => {
                const info = typeIcon(ch.type);
                return (
                  <div key={ch.id} className={cn(
                    'bg-card border rounded-xl p-5 transition-all',
                    ch.enabled ? 'border-border' : 'border-border/40 opacity-60'
                  )}>
                    <div className="flex items-start gap-4">
                      <div className={cn('p-2.5 rounded-xl ring-1 flex-shrink-0', info.ring, info.bg)}>
                        <info.icon className={cn('w-4 h-4', info.color)} strokeWidth={2} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[15px] font-semibold text-card-foreground">{ch.name}</span>
                          <span className="font-mono text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded capitalize">{ch.type}</span>
                          {ch.enabled
                            ? <span className="text-[11px] font-semibold text-success bg-success/10 px-2 py-0.5 rounded-md ring-1 ring-success/20">Active</span>
                            : <span className="text-[11px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-md">Disabled</span>
                          }
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {(ch.events ?? []).map(ev => (
                            <span key={ev} className="font-mono text-[10px] bg-muted/50 text-muted-foreground px-2 py-0.5 rounded border border-border/50">{ev}</span>
                          ))}
                          {!ch.events?.length && <span className="text-[11px] text-muted-foreground/40">No events subscribed</span>}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-1.5">Added {fmtDate(ch.created_at)}</div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleTest(ch.id)}
                          disabled={testingId === ch.id || !ch.enabled}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-40"
                        >
                          {testingId === ch.id
                            ? <><RefreshCw className="w-3 h-3 animate-spin" /> Sending…</>
                            : <><Send className="w-3 h-3" /> Test</>
                          }
                        </button>
                        <button
                          onClick={() => handleToggle(ch.id, ch.enabled)}
                          className="p-1.5 rounded-lg hover:bg-muted/40 transition-colors"
                          title={ch.enabled ? 'Disable' : 'Enable'}
                        >
                          {ch.enabled
                            ? <ToggleRight className="w-5 h-5 text-success" />
                            : <ToggleLeft  className="w-5 h-5 text-muted-foreground/40" />
                          }
                        </button>
                        <button
                          onClick={() => handleDelete(ch.id)}
                          className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground/40 hover:text-destructive transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* GitHub + Linear roadmap panels */}
        <div>
          <h2 className={cn(TEXT.sectionTitle, 'mb-4')}>Coming in Phase 3</h2>
          <div className="grid grid-cols-2 gap-4">
            {[
              { ...GITHUB_INFO, features: ['Auto-create issues from agent errors', 'Link PRs to task completions', 'Sync labels with agent roles', 'Trigger agents from PR reviews'] },
              { ...LINEAR_INFO, features: ['Sync goals with Linear projects', 'Push tasks to Linear on agent completion', 'Bidirectional status updates', 'Assign Linear issues to agents'] },
            ].map(int => (
              <div key={int.label} className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className={cn('p-2.5 rounded-xl ring-1', int.ring, int.bg)}>
                    <int.icon className={cn('w-4 h-4', int.color)} strokeWidth={2} />
                  </div>
                  <div>
                    <div className="text-[14px] font-semibold text-card-foreground">{int.label}</div>
                    <div className="text-[11px] text-muted-foreground">{int.phase}</div>
                  </div>
                  <span className="ml-auto text-[10px] font-semibold bg-muted text-muted-foreground px-2.5 py-1 rounded-full">Planned</span>
                </div>
                <p className="text-[12px] text-muted-foreground leading-relaxed mb-3">{int.desc}</p>
                <ul className="space-y-1.5">
                  {int.features.map(f => (
                    <li key={f} className="flex items-center gap-2 text-[12px] text-muted-foreground/70">
                      <span className="w-1 h-1 rounded-full bg-muted-foreground/40 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

      </PageBody>
    </PageLayout>
  );
}
