'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Server, Terminal, RefreshCw, Play, AlertTriangle, CheckCircle,
  XCircle, Activity, HardDrive, Cpu, Box, ChevronRight,
  Shield, Clock, Zap,
} from 'lucide-react';
import { TEXT, LAYOUT, CARD } from '@/lib/tokens';
import { cn } from '@/lib/utils';
import {
  PageHeader, PageBody, PageLayout,
  SidebarSection, SidebarDivider, SidebarRow, MiniProgressBar,
} from '@/components/ui';

const API  = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const KEY  = process.env.NEXT_PUBLIC_CONTROL_CENTER_API_KEY ?? '';
const AUTH = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

// ── Types ─────────────────────────────────────────────────────────────────

interface HealthData {
  ok: boolean;
  uptime: string | null;
  memory: { total: number; used: number; free: number; pct: number } | null;
  disk: { total: string; used: string; avail: string; usePct: string } | null;
  containers: Array<{ name: string; status: string; image: string; running: boolean }>;
  checkedAt: string;
}

interface RunResult {
  success: boolean;
  safety: 'safe' | 'requires_approval' | 'blocked';
  command: string;
  output: string | null;
  stdout?: string | null;
  stderr?: string | null;
  reason?: string;
  requiresApproval?: boolean;
  error?: string;
  detail?: string;
  executedAt?: string;
}

interface HistoryEntry {
  id: number;
  command: string;
  result: RunResult;
  ts: string;
}

// ── Quick commands palette ────────────────────────────────────────────────

const QUICK_COMMANDS = [
  { label: 'System uptime',       cmd: 'uptime',                       icon: Clock,    safety: 'safe' as const },
  { label: 'Docker containers',   cmd: 'docker ps',                    icon: Box,      safety: 'safe' as const },
  { label: 'Docker logs (10)',    cmd: 'docker logs paperclip-cumf-paperclip-1 --tail 20', icon: Terminal, safety: 'safe' as const },
  { label: 'Disk usage',          cmd: 'df -h /',                      icon: HardDrive, safety: 'safe' as const },
  { label: 'Memory',              cmd: 'free -m',                      icon: Cpu,      safety: 'safe' as const },
  { label: 'Process list',        cmd: 'ps aux',                       icon: Activity, safety: 'safe' as const },
  { label: 'Node version',        cmd: 'node --version',               icon: Zap,      safety: 'safe' as const },
  { label: 'Restart container',   cmd: 'docker restart paperclip-cumf-paperclip-1', icon: RefreshCw, safety: 'approval' as const },
];

// ── Safety config ─────────────────────────────────────────────────────────

const SAFETY_STYLE = {
  safe:              { color: 'text-success',     bg: 'bg-success/10 ring-success/20',     icon: CheckCircle, label: 'Safe' },
  requires_approval: { color: 'text-warning',     bg: 'bg-warning/10 ring-warning/20',     icon: AlertTriangle, label: 'Needs approval' },
  blocked:           { color: 'text-destructive', bg: 'bg-destructive/10 ring-destructive/20', icon: XCircle, label: 'Blocked' },
};

// ══════════════════════════════════════════════════════════════════════════
export default function ServersPage() {
  const [health, setHealth]         = useState<HealthData | null>(null);
  const [healthLoading, setHL]      = useState(true);
  const [healthErr, setHE]          = useState<string | null>(null);

  const [command, setCommand]       = useState('');
  const [running, setRunning]       = useState(false);
  const [pendingApproval, setPending] = useState<string | null>(null);
  const [history, setHistory]       = useState<HistoryEntry[]>([]);
  const historyRef                  = useRef<HTMLDivElement>(null);
  const inputRef                    = useRef<HTMLInputElement>(null);
  let   historyId                   = useRef(0);

  const fetchHealth = useCallback(async () => {
    setHL(true); setHE(null);
    try {
      const res = await fetch(`${API}/api/vps/health`, { headers: AUTH });
      if (!res.ok) throw new Error(`${res.status}`);
      setHealth(await res.json());
    } catch (e: any) { setHE(e.message); }
    finally { setHL(false); }
  }, []);

  useEffect(() => { fetchHealth(); }, [fetchHealth]);

  // Scroll history to bottom when new entries added
  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
  }, [history]);

  const pushHistory = (cmd: string, result: RunResult) => {
    setHistory(prev => [...prev, {
      id: ++historyId.current,
      command: cmd,
      result,
      ts: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    }]);
  };

  const runCommand = useCallback(async (cmd: string, approved = false) => {
    if (!cmd.trim() || running) return;
    setRunning(true);
    setPending(null);
    try {
      const res = await fetch(`${API}/api/vps/run`, {
        method: 'POST',
        headers: AUTH,
        body: JSON.stringify({ command: cmd.trim(), approved }),
      });
      const json: RunResult = await res.json();
      if (json.requiresApproval) {
        setPending(cmd.trim());
        pushHistory(cmd.trim(), json);
      } else {
        pushHistory(cmd.trim(), json);
      }
    } catch (e: any) {
      pushHistory(cmd.trim(), { success: false, safety: 'safe', command: cmd, output: null, error: e.message });
    } finally {
      setRunning(false);
      setCommand('');
      inputRef.current?.focus();
    }
  }, [running]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runCommand(command); }
  };

  const memPct   = health?.memory?.pct ?? 0;
  const diskPct  = parseInt(health?.disk?.usePct?.replace('%', '') ?? '0', 10);

  const sidebar = (
    <div className={LAYOUT.rightSidebar}>
      <SidebarSection title="VPS Health">
        {healthLoading ? (
          <div className="text-center py-4">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground/30" />
          </div>
        ) : healthErr ? (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/5 border border-destructive/15">
            <XCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
            <span className="text-[12px] text-destructive">VPS unreachable</span>
          </div>
        ) : health ? (
          <div className="space-y-3">
            <div className={cn(CARD.panel, 'text-center')}>
              <div className={cn('text-[11px] font-semibold mb-2', health.ok ? 'text-success' : 'text-destructive')}>
                {health.ok ? '● Online' : '● Offline'}
              </div>
              {health.uptime && (
                <div className="text-[11px] text-muted-foreground font-mono leading-relaxed">
                  {health.uptime.split(',').slice(0, 2).join(',')}
                </div>
              )}
            </div>

            {health.memory && (
              <div>
                <div className="flex justify-between mb-1.5">
                  <span className="text-[11px] text-muted-foreground">Memory</span>
                  <span className="text-[11px] font-semibold text-card-foreground">{health.memory.used}MB / {health.memory.total}MB</span>
                </div>
                <MiniProgressBar value={memPct} max={100} colorClass={memPct > 85 ? 'bg-destructive/60' : 'bg-primary/50'} height="h-1.5" />
                <div className="text-[10px] text-muted-foreground mt-1">{memPct}% used · {health.memory.free}MB free</div>
              </div>
            )}

            {health.disk && (
              <div>
                <div className="flex justify-between mb-1.5">
                  <span className="text-[11px] text-muted-foreground">Disk /</span>
                  <span className="text-[11px] font-semibold text-card-foreground">{health.disk.used} / {health.disk.total}</span>
                </div>
                <MiniProgressBar value={diskPct} max={100} colorClass={diskPct > 85 ? 'bg-destructive/60' : 'bg-chart-2/50'} height="h-1.5" />
                <div className="text-[10px] text-muted-foreground mt-1">{health.disk.usePct} used · {health.disk.avail} free</div>
              </div>
            )}
          </div>
        ) : null}
        <button onClick={fetchHealth} disabled={healthLoading}
          className="mt-3 w-full flex items-center justify-center gap-2 py-2 text-[12px] font-medium rounded-lg border border-border bg-muted/30 hover:bg-muted/60 text-muted-foreground transition-colors disabled:opacity-40">
          <RefreshCw className={cn('w-3 h-3', healthLoading && 'animate-spin')} /> Refresh
        </button>
      </SidebarSection>

      <SidebarDivider />

      <SidebarSection title="Containers">
        {health?.containers?.length ? (
          <div className="space-y-1.5">
            {health.containers.map(c => (
              <div key={c.name} className="flex items-center gap-2 py-1">
                <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', c.running ? 'bg-success' : 'bg-destructive')} />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium text-foreground truncate">{c.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{c.status}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[12px] text-muted-foreground py-2">No container data</div>
        )}
      </SidebarSection>

      <SidebarDivider />

      <SidebarSection title="Safety Policy">
        <div className="space-y-2">
          {Object.entries(SAFETY_STYLE).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2">
              <v.icon className={cn('w-3 h-3 flex-shrink-0', v.color)} />
              <span className="text-[12px] text-foreground">{v.label}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 p-3 rounded-lg bg-muted/30 border border-border">
          <div className="text-[10px] text-muted-foreground leading-relaxed">
            Every command passes through the <span className="text-foreground font-semibold">evaluateCommand()</span> harness before execution. Destructive operations are always blocked.
          </div>
        </div>
      </SidebarSection>
    </div>
  );

  return (
    <PageLayout sidebar={sidebar}>
      <PageHeader
        title="VPS Servers"
        subtitle={`72.61.82.22 · SSH runner · command safety harness`}
      />
      <PageBody>

        {/* Quick Commands */}
        <div>
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Quick Commands</div>
          <div className="grid grid-cols-4 gap-2">
            {QUICK_COMMANDS.map(q => (
              <button
                key={q.cmd}
                onClick={() => runCommand(q.cmd)}
                disabled={running}
                className={cn(
                  'flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-left transition-all group disabled:opacity-50',
                  q.safety === 'approval'
                    ? 'border-warning/20 bg-warning/5 hover:bg-warning/10'
                    : 'border-border bg-card hover:bg-muted/40 hover:-translate-y-px hover:shadow-sm'
                )}
              >
                <q.icon className={cn('w-3.5 h-3.5 flex-shrink-0', q.safety === 'approval' ? 'text-warning' : 'text-muted-foreground group-hover:text-primary')} strokeWidth={2} />
                <div className="min-w-0">
                  <div className="text-[12px] font-medium text-foreground truncate">{q.label}</div>
                  {q.safety === 'approval' && (
                    <div className="text-[10px] text-warning/70 mt-0.5">Needs approval</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Terminal */}
        <div>
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-muted/40 ring-1 ring-border">
              <Terminal className="w-4 h-4 text-muted-foreground" strokeWidth={2} />
            </div>
            <div>
              <h2 className={TEXT.sectionTitle}>SSH Terminal</h2>
              <p className={cn(TEXT.sectionSub, 'mt-0')}>Commands are evaluated by the safety harness before execution</p>
            </div>
            {running && (
              <div className="ml-auto flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <RefreshCw className="w-3 h-3 animate-spin" /> Running…
              </div>
            )}
          </div>

          {/* History output */}
          <div
            ref={historyRef}
            className="bg-[#0d1117] border border-border/60 rounded-t-xl font-mono text-[12px] leading-relaxed overflow-y-auto"
            style={{ height: '340px', minHeight: '340px' }}
          >
            {history.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground/30 text-[13px]">
                Run a command to see output here
              </div>
            ) : (
              <div className="p-4 space-y-4">
                {history.map(entry => {
                  const safety = SAFETY_STYLE[entry.result.safety] ?? SAFETY_STYLE.safe;
                  return (
                    <div key={entry.id}>
                      {/* Command line */}
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-muted-foreground/40 text-[10px]">{entry.ts}</span>
                        <span className="text-success/70">$</span>
                        <span className="text-white/90">{entry.command}</span>
                        <span className={cn('ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded ring-1', safety.bg, safety.color)}>
                          {safety.label}
                        </span>
                      </div>
                      {/* Output */}
                      {entry.result.requiresApproval ? (
                        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-warning/10 border border-warning/20">
                          <AlertTriangle className="w-3.5 h-3.5 text-warning flex-shrink-0" />
                          <span className="text-warning text-[12px]">Requires approval — click Approve to run</span>
                          <button
                            onClick={() => runCommand(entry.command, true)}
                            disabled={running}
                            className="ml-auto px-3 py-1 text-[11px] font-semibold bg-warning text-white rounded-md hover:bg-warning/90 disabled:opacity-50 transition-colors"
                          >
                            Approve & Run
                          </button>
                        </div>
                      ) : entry.result.safety === 'blocked' ? (
                        <div className="px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-[12px]">
                          ✗ Blocked: {entry.result.reason}
                        </div>
                      ) : entry.result.success === false && entry.result.error ? (
                        <div className="px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive/80 text-[12px]">
                          Error: {entry.result.error}{entry.result.detail ? ` — ${entry.result.detail}` : ''}
                        </div>
                      ) : (
                        <pre className="text-[11px] text-green-300/80 whitespace-pre-wrap break-all pl-4 max-h-48 overflow-y-auto">
                          {entry.result.output ?? '(no output)'}
                        </pre>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Input bar */}
          <div className="flex items-center gap-0 border border-t-0 border-border/60 rounded-b-xl bg-[#161b22] overflow-hidden">
            <span className="text-success/70 font-mono text-[13px] pl-4 pr-2 select-none">$</span>
            <input
              ref={inputRef}
              value={command}
              onChange={e => setCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a command and press Enter…"
              disabled={running}
              className="flex-1 bg-transparent text-white/90 font-mono text-[13px] py-3.5 pr-3 outline-none placeholder:text-muted-foreground/30 disabled:opacity-50"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              onClick={() => runCommand(command)}
              disabled={running || !command.trim()}
              className="flex items-center gap-2 px-5 py-3.5 text-[12px] font-semibold text-white/80 hover:text-white bg-white/5 hover:bg-white/10 border-l border-border/30 transition-colors disabled:opacity-30"
            >
              <Play className="w-3.5 h-3.5" />
              Run
            </button>
          </div>
        </div>

        {/* LLM Config quick-link panel */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-primary/10 ring-1 ring-primary/20">
              <Shield className="w-4 h-4 text-primary" strokeWidth={2} />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-card-foreground">LLM Provider Config</h3>
              <p className="text-[12px] text-muted-foreground mt-0.5">Configure which AI providers are active on the VPS</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {['OpenAI / Codex', 'Anthropic Claude', 'Z.ai GLM'].map(provider => (
              <div key={provider} className="px-4 py-3 rounded-lg border border-border bg-muted/20 flex items-center justify-between">
                <span className="text-[13px] font-medium text-foreground">{provider}</span>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40" />
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">
            Use <code className="font-mono bg-muted px-1 rounded">POST /api/vps/llm-config</code> or the CLI to push keys to the VPS .env.
          </p>
        </div>

      </PageBody>
    </PageLayout>
  );
}
