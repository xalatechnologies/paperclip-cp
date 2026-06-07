'use client';

import { useState, useEffect } from 'react';
import {
  Cpu, Shield, CheckCircle, XCircle, Loader, ChevronRight,
  Server, Zap, AlertTriangle, Info
} from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const KEY = process.env.NEXT_PUBLIC_CONTROL_CENTER_API_KEY ?? '';
const H = { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' };

interface LlmStatus {
  openai: { configured: boolean; baseUrl: string | null; model: string };
  anthropic: { configured: boolean };
  zai: { configured: boolean };
}

export default function SettingsPage() {
  const [status, setStatus] = useState<LlmStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [zaiKey, setZaiKey] = useState('');
  const [updateModels, setUpdateModels] = useState(true);

  const refreshStatus = () => {
    fetch(`${API}/api/vps/llm-status`, { headers: H })
      .then(r => r.json())
      .then(data => setStatus(data))
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => { refreshStatus(); }, []);

  const apply = async () => {
    if (!zaiKey) { setMessage({ type: 'error', text: 'Enter a Z.ai API key.' }); return; }
    setSaving(true); setMessage(null);
    try {
      const r = await fetch(`${API}/api/vps/llm-config`, {
        method: 'POST', headers: H,
        body: JSON.stringify({ openaiApiKey: zaiKey, openaiBaseUrl: 'https://api.z.ai/api/coding/paas/v4', openaiModel: 'glm-5.1', restart: true }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? 'Failed');
      if (updateModels) {
        await fetch(`${API}/api/vps/agent-models`, { method: 'POST', headers: H, body: JSON.stringify({ model: 'glm-5.1' }) });
      }
      setMessage({ type: 'success', text: 'LLM configuration applied. Container restarting…' });
      setZaiKey('');
      setTimeout(() => refreshStatus(), 5000);
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    } finally { setSaving(false); }
  };

  const providers = [
    { name: 'Z.ai → GLM-5.1', sub: 'OpenAI-compatible · Execution · Tests · Docs', icon: Cpu, color: 'text-primary', bg: 'bg-primary/10', configured: status?.zai?.configured, extra: status?.zai?.configured ? status?.openai?.baseUrl : null },
    { name: 'OpenAI / Codex', sub: 'codex_local adapter', icon: Cpu, color: 'text-chart-2', bg: 'bg-chart-2/10', configured: status?.openai?.configured, extra: status?.openai?.configured ? status?.openai.model : null },
    { name: 'Anthropic Claude', sub: 'Architect · Reviewer · CLI auth (claude login)', icon: Shield, color: 'text-warning', bg: 'bg-warning/10', configured: true, extra: 'claude-opus-4-5' },
  ];

  const inputCls = "w-full px-3 py-2 bg-background border border-border rounded-md text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring transition-colors";

  const configuredCount = providers.filter(p => p.configured).length;

  return (
    <>
      <div className="px-7 py-5 border-b border-border bg-card sticky top-0 z-40">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-card-foreground tracking-tight">Settings</h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">LLM providers, VPS configuration, system settings</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md ${
              configuredCount === providers.length ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
            }`}>
              {configuredCount}/{providers.length} providers configured
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Main */}
        <div className="flex-1 p-7 overflow-y-auto space-y-7">

          {/* Provider Status */}
          <div>
            <h2 className="text-sm font-semibold text-card-foreground mb-1">LLM Provider Status</h2>
            <p className="text-xs text-muted-foreground mb-4">Current model configuration on the Paperclip VPS</p>
            <div className="grid grid-cols-3 gap-3">
              {providers.map(p => (
                <div key={p.name} className="bg-card border border-border rounded-lg p-5">
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className={`w-8 h-8 rounded-md ${p.bg} ${p.color} flex items-center justify-center`}>
                      <p.icon size={16} />
                    </div>
                    <div>
                      <div className="font-semibold text-sm text-card-foreground">{p.name}</div>
                      <div className="text-[11px] text-muted-foreground">{p.sub}</div>
                    </div>
                  </div>
                  {loading ? (
                    <div className="text-muted-foreground text-xs flex items-center gap-1.5">
                      <Loader size={12} className="animate-spin" /> Checking…
                    </div>
                  ) : status === null ? (
                    <div className="flex items-center gap-1.5">
                      <XCircle size={14} className="text-destructive" />
                      <span className="text-destructive text-[13px] font-medium">API unreachable</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5 mb-2">
                        {p.configured ? (
                          <><CheckCircle size={14} className="text-success" /><span className="text-success text-[13px] font-medium">Configured</span></>
                        ) : (
                          <><XCircle size={14} className="text-destructive" /><span className="text-destructive text-[13px] font-medium">Not set</span></>
                        )}
                      </div>
                      {p.extra && (
                        <div className="text-[11px] text-muted-foreground font-mono bg-muted px-2 py-1 rounded truncate">{p.extra}</div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Configure */}
          <div>
            <h2 className="text-sm font-semibold text-card-foreground mb-1">Configure LLM Provider</h2>
            <p className="text-xs text-muted-foreground mb-4">Apply keys directly to the Paperclip VPS container — restarts automatically</p>

            <div className="bg-card border border-border rounded-lg p-6 max-w-[700px]">
              {message && (
                <div className={`flex items-center gap-2 p-3 rounded-lg text-[13px] mb-5 border ${
                  message.type === 'success'
                    ? 'bg-success/5 border-success/15 text-success'
                    : 'bg-destructive/5 border-destructive/15 text-destructive'
                }`}>
                  {message.type === 'success' ? <CheckCircle size={14} /> : <XCircle size={14} />}
                  <span>{message.text}</span>
                </div>
              )}

              <div className="mb-5">
                <label className="text-[13px] font-semibold text-card-foreground mb-1.5 block">
                  Z.ai API Key
                  <span className="ml-2 text-[11px] text-muted-foreground font-normal">→ GLM-5.1 via OpenAI-compatible endpoint</span>
                </label>
                <div className="text-[11px] text-muted-foreground mb-2">
                  Get yours at{' '}
                  <a href="https://z.ai/subscribe" target="_blank" rel="noopener" className="text-primary hover:underline">
                    z.ai/subscribe
                  </a>{' '}
                  → GLM Coding Plan Max · 1600 prompts/5h
                </div>
                <input
                  type="password"
                  placeholder="z-ai-xxxxxxxxxxxxxxxxxxxxxxxx"
                  value={zaiKey}
                  onChange={e => setZaiKey(e.target.value)}
                  id="zai-api-key"
                  className={inputCls}
                />
                <div className="mt-1.5 text-[11px] text-muted-foreground">
                  Sets: <code className="font-mono text-[10px]">OPENAI_API_KEY</code>
                  {' + '}<code className="font-mono text-[10px]">OPENAI_BASE_URL=https://api.z.ai/api/coding/paas/v4</code>
                  {' + '}<code className="font-mono text-[10px]">CODEX_DEFAULT_MODEL=glm-5.1</code>
                </div>
              </div>

              <div className="border-t border-border my-5" />

              <div className="flex items-center gap-2 mb-5">
                <input
                  type="checkbox"
                  id="update-models"
                  checked={updateModels}
                  onChange={e => setUpdateModels(e.target.checked)}
                  className="w-3.5 h-3.5 rounded accent-primary"
                />
                <label htmlFor="update-models" className="text-[13px] text-foreground cursor-pointer">
                  Update all <code className="font-mono text-[11px] text-muted-foreground">codex_local</code> agents to use <code className="font-mono text-[11px] text-muted-foreground">glm-5.1</code>
                </label>
              </div>

              <button
                onClick={apply}
                disabled={saving || !zaiKey}
                id="apply-llm-config"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-[13px] font-medium rounded-md hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? <Loader size={14} className="animate-spin" /> : <ChevronRight size={14} />}
                {saving ? 'Applying…' : 'Apply to VPS & Restart Container'}
              </button>

              <p className="mt-3 text-[11px] text-muted-foreground">
                Keys are written directly to <code className="font-mono text-[10px]">/docker/paperclip-cumf/.env</code> on the VPS. Not stored in PCC.
              </p>
            </div>
          </div>

          {/* Model assignment */}
          <div>
            <h2 className="text-sm font-semibold text-card-foreground mb-1">Recommended Model Assignment</h2>
            <p className="text-xs text-muted-foreground mb-4">Best-fit model for each agent role</p>
            <div className="bg-card border border-border rounded-lg overflow-hidden max-w-[700px]">
              <table className="w-full text-[13px] border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    {['Role', 'Adapter', 'Model', 'Agents'].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { role: 'Architect / Reviewer', adapter: 'claude_local', model: 'claude-opus-4-5', agents: 'CEO, Deep Review Agent' },
                    { role: 'Executor / Tester', adapter: 'codex_local', model: 'glm-5.1 (Z.ai)', agents: 'Bug Fix, QA, UI agents' },
                    { role: 'Gateway', adapter: 'openclaw_gateway', model: '—', agents: 'OpenClaw agents' },
                  ].map(row => (
                    <tr key={row.role} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-semibold text-card-foreground">{row.role}</td>
                      <td className="px-4 py-3"><span className="font-mono text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{row.adapter}</span></td>
                      <td className="px-4 py-3"><span className="font-mono text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{row.model}</span></td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{row.agents}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="w-[260px] border-l border-border bg-card/50 p-5 space-y-5 flex-shrink-0 overflow-y-auto hidden xl:block">
          <div>
            <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Provider Status</h3>
            <div className="space-y-2">
              {providers.map(p => (
                <div key={p.name} className="flex items-center justify-between py-1">
                  <span className="text-xs text-foreground">{p.name.split('→')[0].trim()}</span>
                  {loading ? (
                    <Loader className="w-3 h-3 animate-spin text-muted-foreground" />
                  ) : p.configured ? (
                    <CheckCircle className="w-3.5 h-3.5 text-success" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-destructive" />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-border" />

          <div>
            <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">VPS Config</h3>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Container</span>
                <span className="font-mono text-foreground">paperclip-cumf</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Env file</span>
                <span className="font-mono text-foreground text-[10px]">/docker/…/.env</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Auto-restart</span>
                <span className="text-success font-semibold">Yes</span>
              </div>
            </div>
          </div>

          <div className="border-t border-border" />

          <div>
            <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Anti-Bloat Policy</h3>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Context mode</span>
                <span className="text-success font-semibold">Thin</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Max retries</span>
                <span className="font-mono text-foreground">1</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Retry delay</span>
                <span className="font-mono text-foreground">60s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Simple agents</span>
                <span className="font-mono text-foreground">5 turns</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Specialists</span>
                <span className="font-mono text-foreground">25 turns</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Concurrency</span>
                <span className="font-mono text-foreground">1–3</span>
              </div>
            </div>
          </div>

          <div className="border-t border-border" />

          <div className="flex items-start gap-2 p-3 rounded-md bg-primary/5 border border-primary/15">
            <Info className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              API keys are never stored in PCC or Convex. They are written directly to the VPS container .env file.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
