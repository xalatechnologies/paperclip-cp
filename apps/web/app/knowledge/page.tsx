'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Database, Upload, Search, FileText, File, Trash2,
  RefreshCw, Plus, CheckCircle, AlertTriangle,
  Layers, Hash, Bot, Building2, Link2, X,
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

interface Collection {
  id: string;
  name: string;
  paperclip_company_id: string;
  description: string | null;
  embedding_model: string;
  chunk_strategy: string;
  bound_agent_ids: string[];
  status: 'ready' | 'indexing' | 'error';
  doc_count: number;
  chunk_count: number;
  created_at: number;
}

interface KnowledgeDocument {
  id: string;
  collection_id: string;
  name: string;
  file_type: string;
  chunk_count: number;
  size_bytes: number;
  created_at: number;
}

interface SearchResult {
  document_id: string;
  document_name: string;
  collection_id: string;
  snippet: string;
  score: number;
}

interface VpsAgent { id: string; name: string; role: string; company_id: string; company_name: string; }
interface VpsCompany { id: string; name: string; }

function fmtSize(b: number) {
  if (b >= 1048576) return `${(b / 1048576).toFixed(1)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${b} B`;
}

function fmtDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function FileIcon({ type }: { type: string }) {
  if (type === 'md') return <Hash className="w-4 h-4 text-primary/70" strokeWidth={2} />;
  if (type === 'pdf') return <FileText className="w-4 h-4 text-destructive/70" strokeWidth={2} />;
  return <File className="w-4 h-4 text-muted-foreground" strokeWidth={2} />;
}

// ── New Collection Form ─────────────────────────────────────────────────────

function NewCollectionForm({ companies, agents, onAdd, onClose }: {
  companies: VpsCompany[]; agents: VpsAgent[];
  onAdd: (d: any) => Promise<void>; onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: '',
    paperclip_company_id: companies[0]?.id ?? '',
    description: '',
    embedding_model: 'text-embedding-3-small',
    chunk_strategy: 'sliding_512',
    bound_agent_ids: [] as string[],
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const filteredAgents = form.paperclip_company_id
    ? agents.filter(a => a.company_id === form.paperclip_company_id)
    : agents;

  const toggleAgent = (id: string) => {
    setForm(f => ({
      ...f,
      bound_agent_ids: f.bound_agent_ids.includes(id)
        ? f.bound_agent_ids.filter(x => x !== id)
        : [...f.bound_agent_ids, id],
    }));
  };

  const submit = async () => {
    if (!form.name.trim()) { setErr('Name required'); return; }
    setSaving(true); setErr(null);
    try { await onAdd(form); onClose(); }
    catch (e: any) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-card border border-primary/20 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <h3 className="text-[14px] font-semibold">New Collection</h3>
        <button onClick={onClose} className="text-[18px] text-muted-foreground/40 hover:text-foreground">×</button>
      </div>
      <div className="p-5 grid grid-cols-2 gap-4">
        <div>
          <label className={cn(TEXT.label, 'block mb-1.5')}>Name</label>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Doxis SmartForms Docs"
            className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:ring-1 focus:ring-primary/40" />
        </div>
        <div>
          <label className={cn(TEXT.label, 'block mb-1.5')}>Company</label>
          <select value={form.paperclip_company_id}
            onChange={e => setForm(f => ({ ...f, paperclip_company_id: e.target.value, bound_agent_ids: [] }))}
            className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2.5 text-[13px] text-foreground outline-none">
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className={cn(TEXT.label, 'block mb-1.5')}>Description</label>
          <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="What kind of documents does this collection hold?"
            className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/40 outline-none" />
        </div>
        <div>
          <label className={cn(TEXT.label, 'block mb-1.5')}>Embedding Model</label>
          <select value={form.embedding_model} onChange={e => setForm(f => ({ ...f, embedding_model: e.target.value }))}
            className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2.5 text-[13px] text-foreground outline-none">
            <option value="text-embedding-3-small">text-embedding-3-small</option>
            <option value="text-embedding-3-large">text-embedding-3-large</option>
            <option value="text-embedding-ada-002">text-embedding-ada-002</option>
          </select>
        </div>
        <div>
          <label className={cn(TEXT.label, 'block mb-1.5')}>Chunk Strategy</label>
          <select value={form.chunk_strategy} onChange={e => setForm(f => ({ ...f, chunk_strategy: e.target.value }))}
            className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2.5 text-[13px] text-foreground outline-none">
            <option value="sliding_512">Sliding window (512 tok)</option>
            <option value="sliding_256">Sliding window (256 tok)</option>
            <option value="paragraph">By paragraph</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className={cn(TEXT.label, 'block mb-2')}>Bind to Agents</label>
          <div className="flex flex-wrap gap-2">
            {filteredAgents.map(a => (
              <button key={a.id} onClick={() => toggleAgent(a.id)}
                className={cn('flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] border transition-all',
                  form.bound_agent_ids.includes(a.id)
                    ? 'bg-primary/10 border-primary/30 text-primary'
                    : 'bg-muted/20 border-border text-muted-foreground hover:border-border/80')}>
                <Bot className="w-3 h-3" />
                {a.name}
              </button>
            ))}
            {filteredAgents.length === 0 && <span className="text-[12px] text-muted-foreground">Select a company first</span>}
          </div>
        </div>
        {err && <div className="col-span-2 text-[12px] text-destructive">{err}</div>}
        <div className="col-span-2 flex justify-end gap-3 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-[13px] border border-border rounded-lg text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
          <button onClick={submit} disabled={saving || !form.name.trim()}
            className="flex items-center gap-2 px-5 py-2 text-[13px] font-semibold bg-primary/90 hover:bg-primary text-white rounded-lg transition-colors disabled:opacity-50">
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
            Create Collection
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Upload Document Form ──────────────────────────────────────────────────

function UploadDocForm({ colId, onAdd, onClose }: {
  colId: string; onAdd: (d: any) => Promise<void>; onClose: () => void;
}) {
  const [form, setForm] = useState({ name: '', file_type: 'md', content: '' });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.name.trim() || !form.content.trim()) return;
    setSaving(true);
    try { await onAdd({ ...form, collection_id: colId }); onClose(); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-muted/20 border border-border/60 rounded-xl p-4 mt-3 space-y-3">
      <div className="flex gap-3">
        <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder="Document name (e.g. API Reference.md)"
          className="flex-1 bg-muted/30 border border-border rounded-lg px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:ring-1 focus:ring-primary/40" />
        <select value={form.file_type} onChange={e => setForm(f => ({ ...f, file_type: e.target.value }))}
          className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-[13px] text-foreground outline-none">
          <option value="md">Markdown</option>
          <option value="text">Plain text</option>
          <option value="pdf">PDF (text)</option>
        </select>
      </div>
      <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
        rows={5} placeholder="Paste document content here…"
        className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/40 outline-none resize-none focus:ring-1 focus:ring-primary/40" />
      <div className="text-[10px] text-muted-foreground">~{Math.ceil(form.content.length / 4)} tokens · {Math.ceil(form.content.length / 2048)} chunks</div>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-3 py-1.5 text-[12px] border border-border rounded-lg text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
        <button onClick={submit} disabled={saving || !form.name.trim() || !form.content.trim()}
          className="flex items-center gap-1.5 px-4 py-1.5 text-[12px] font-semibold bg-primary/90 hover:bg-primary text-white rounded-lg transition-colors disabled:opacity-50">
          {saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
          Upload
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
export default function KnowledgePage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [agents, setAgents]           = useState<VpsAgent[]>([]);
  const [companies, setCompanies]     = useState<VpsCompany[]>([]);
  const [selectedCol, setSelectedCol] = useState<Collection | null>(null);
  const [docs, setDocs]               = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading]         = useState(true);
  const [docsLoading, setDocsLoading] = useState(false);
  const [err, setErr]                 = useState<string | null>(null);
  const [showNewCol, setShowNewCol]   = useState(false);
  const [showUpload, setShowUpload]   = useState(false);
  const [searchQ, setSearchQ]         = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching]     = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [cRes, aRes, compRes] = await Promise.all([
        fetch(`${API}/api/knowledge/collections`, { headers: AUTH }),
        fetch(`${API}/api/control/agents`, { headers: AUTH }),
        fetch(`${API}/api/control/companies`, { headers: AUTH }),
      ]);
      setCollections(await safeArr(cRes));
      setAgents(await safeArr(aRes));
      setCompanies(await safeArr(compRes));
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  const fetchDocs = useCallback(async (colId: string) => {
    setDocsLoading(true);
    const res = await fetch(`${API}/api/knowledge/collections/${colId}/documents`, { headers: AUTH });
    setDocs(await res.json().then(d => Array.isArray(d) ? d : []));
    setDocsLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => {
    if (selectedCol) fetchDocs(selectedCol.id);
    else setDocs([]);
  }, [selectedCol, fetchDocs]);

  const handleNewCol = async (data: any) => {
    const res = await fetch(`${API}/api/knowledge/collections`, { method: 'POST', headers: AUTH, body: JSON.stringify(data) });
    if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
    await fetchAll();
  };

  const handleUpload = async (data: any) => {
    const res = await fetch(`${API}/api/knowledge/collections/${data.collection_id}/documents`, {
      method: 'POST', headers: AUTH, body: JSON.stringify(data),
    });
    if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
    await fetchDocs(data.collection_id);
    await fetchAll();
  };

  const handleDeleteDoc = async (colId: string, docId: string) => {
    await fetch(`${API}/api/knowledge/collections/${colId}/documents/${docId}`, { method: 'DELETE', headers: AUTH });
    setDocs(prev => prev.filter(d => d.id !== docId));
    await fetchAll();
  };

  const handleDeleteCol = async (id: string) => {
    if (!confirm('Delete collection and all documents?')) return;
    await fetch(`${API}/api/knowledge/collections/${id}`, { method: 'DELETE', headers: AUTH });
    if (selectedCol?.id === id) setSelectedCol(null);
    await fetchAll();
  };

  const handleSearch = async () => {
    if (!searchQ.trim()) return;
    setSearching(true); setSearchResults(null);
    const res = await fetch(`${API}/api/knowledge/search`, {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({ query: searchQ, collection_id: selectedCol?.id, top_k: 5 }),
    });
    const data = await res.json();
    setSearchResults(data.results ?? []);
    setSearching(false);
  };

  const totalDocs   = collections.reduce((a, c) => a + c.doc_count, 0);
  const totalChunks = collections.reduce((a, c) => a + c.chunk_count, 0);

  const sidebar = (
    <div className={LAYOUT.rightSidebar}>
      <SidebarSection title="Stats">
        <SidebarRow label="Collections" value={collections.length} />
        <SidebarRow label="Documents"   value={totalDocs} />
        <SidebarRow label="Chunks"      value={totalChunks} valueClass="text-primary" />
      </SidebarSection>
      <SidebarDivider />
      <SidebarSection title="RAG Pipeline">
        {[
          { step: '1', label: 'Upload',   desc: 'MD / PDF / TXT' },
          { step: '2', label: 'Chunk',    desc: '512-tok sliding' },
          { step: '3', label: 'Embed',    desc: 'text-embedding-3' },
          { step: '4', label: 'Index',    desc: 'pgvector on VPS' },
          { step: '5', label: 'Retrieve', desc: 'top-k cosine' },
          { step: '6', label: 'Inject',   desc: 'System prompt ctx' },
        ].map(s => (
          <div key={s.step} className="flex items-start gap-2.5 py-0.5">
            <span className="w-4 h-4 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{s.step}</span>
            <div>
              <div className="text-[12px] font-semibold text-foreground">{s.label}</div>
              <div className="text-[10px] text-muted-foreground">{s.desc}</div>
            </div>
          </div>
        ))}
      </SidebarSection>
      <SidebarDivider />
      {selectedCol && (
        <SidebarSection title="Bound Agents">
          {selectedCol.bound_agent_ids.length === 0 ? (
            <div className="text-[12px] text-muted-foreground">No agents bound</div>
          ) : (
            selectedCol.bound_agent_ids.map(id => {
              const a = agents.find(x => x.id === id);
              return (
                <div key={id} className="flex items-center gap-2 py-0.5">
                  <Bot className="w-3 h-3 text-primary/50" />
                  <span className="text-[12px] text-foreground">{a?.name ?? id.slice(0, 8) + '…'}</span>
                </div>
              );
            })
          )}
        </SidebarSection>
      )}
    </div>
  );

  return (
    <PageLayout sidebar={sidebar}>
      <PageHeader
        title="Knowledge Base"
        subtitle="RAG document store · chunked · embedding-ready · agent injection"
        badge={
          <div className="flex items-center gap-2">
            <button onClick={fetchAll} disabled={loading}
              className="p-2 rounded-lg border border-border bg-card hover:bg-muted transition-colors disabled:opacity-40">
              <RefreshCw className={cn('w-4 h-4 text-muted-foreground', loading && 'animate-spin')} />
            </button>
            <button onClick={() => setShowNewCol(v => !v)}
              className="flex items-center gap-2 px-4 py-2 text-[13px] font-semibold rounded-lg bg-primary/90 hover:bg-primary text-white transition-colors">
              <Plus className="w-3.5 h-3.5" /> New Collection
            </button>
          </div>
        }
      />
      <PageBody>
        <StatGrid cols={4}>
          <StatCard label="Collections" value={collections.length} sub="document groups"  icon={Database}  color="text-primary"  ring="primary"  />
          <StatCard label="Documents"   value={totalDocs}          sub="indexed files"    icon={FileText}  color="text-chart-2"  ring="chart2"   />
          <StatCard label="Chunks"      value={totalChunks}        sub="vector-ready"     icon={Layers}    color="text-success"  ring="success"  />
          <StatCard label="Agents"      value={agents.length}      sub="available to bind" icon={Bot}      color="text-warning"  ring="warning"  />
        </StatGrid>

        {showNewCol && (
          <NewCollectionForm companies={companies} agents={agents}
            onAdd={handleNewCol} onClose={() => setShowNewCol(false)} />
        )}

        {err && (
          <div className="flex items-center gap-3 p-4 rounded-xl border border-destructive/15 bg-destructive/5">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            <span className="text-[13px] text-destructive">{err}</span>
          </div>
        )}

        {/* Collections grid */}
        <div>
          <h2 className={cn(TEXT.sectionTitle, 'mb-4')}>Collections</h2>
          {loading ? (
            <div className="py-8 text-center"><RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground/30" /></div>
          ) : collections.length === 0 ? (
            <EmptyState icon={Database} title="No collections yet" description="Create a collection to start indexing documents for RAG." />
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {collections.map(col => {
                const selected = selectedCol?.id === col.id;
                return (
                  <div key={col.id} className={cn(
                    'p-5 rounded-xl border transition-all hover:shadow-sm cursor-pointer relative group',
                    selected ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'
                  )} onClick={() => setSelectedCol(selected ? null : col)}>
                    <button onClick={e => { e.stopPropagation(); handleDeleteCol(col.id); }}
                      className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-muted-foreground/30 hover:text-destructive transition-all">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <div className="flex items-start gap-3 mb-3">
                      <div className="p-2 rounded-lg bg-primary/10 ring-1 ring-primary/20 flex-shrink-0">
                        <Database className="w-4 h-4 text-primary" strokeWidth={2} />
                      </div>
                      <div className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-md',
                        col.status === 'ready' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning')}>
                        {col.status}
                      </div>
                    </div>
                    <div className="text-[14px] font-bold text-card-foreground mb-1">{col.name}</div>
                    {col.description && <div className="text-[11px] text-muted-foreground mb-3 line-clamp-2">{col.description}</div>}
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                      <span>{col.doc_count} docs</span>
                      <span>·</span>
                      <span>{col.chunk_count} chunks</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-2 text-[10px] text-muted-foreground/60">
                      {col.bound_agent_ids.length > 0 ? (
                        <>
                          <Link2 className="w-3 h-3" />
                          {col.bound_agent_ids.length} agent{col.bound_agent_ids.length > 1 ? 's' : ''} bound
                        </>
                      ) : (
                        'No agents bound'
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground/40 mt-0.5">
                      {companies.find(c => c.id === col.paperclip_company_id)?.name ?? col.paperclip_company_id}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Documents */}
        {selectedCol && (
          <div>
            <div className="flex items-center gap-4 mb-4">
              <h2 className={TEXT.sectionTitle}>
                {selectedCol.name}
                <span className="ml-2 text-[12px] font-normal text-muted-foreground">({docs.length} docs)</span>
              </h2>
              <button onClick={() => setShowUpload(v => !v)}
                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-lg border border-border bg-card hover:bg-muted transition-colors">
                <Upload className="w-3.5 h-3.5" /> Upload Document
              </button>
            </div>

            {showUpload && (
              <UploadDocForm colId={selectedCol.id} onAdd={handleUpload} onClose={() => setShowUpload(false)} />
            )}

            {docsLoading ? (
              <div className="py-6 text-center"><RefreshCw className="w-4 h-4 animate-spin mx-auto text-muted-foreground/30" /></div>
            ) : docs.length === 0 ? (
              <div className="py-8 text-center text-[13px] text-muted-foreground">No documents yet. Upload one above.</div>
            ) : (
              <div className={CARD.table}>
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      {['Document', 'Type', 'Chunks', 'Size', 'Added', ''].map(h => (
                        <th key={h} className="text-left px-5 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.06em] bg-muted/30">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {docs.map(doc => (
                      <tr key={doc.id} className="border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <FileIcon type={doc.file_type} />
                            <span className="text-[13px] font-medium text-card-foreground">{doc.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5"><span className="font-mono text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{doc.file_type}</span></td>
                        <td className="px-5 py-3.5"><span className="font-mono text-[12px] text-foreground">{doc.chunk_count}</span></td>
                        <td className="px-5 py-3.5"><span className="text-[12px] text-muted-foreground">{fmtSize(doc.size_bytes)}</span></td>
                        <td className="px-5 py-3.5"><span className="text-[12px] text-muted-foreground">{fmtDate(doc.created_at)}</span></td>
                        <td className="px-5 py-3.5 text-right">
                          <button onClick={() => handleDeleteDoc(selectedCol.id, doc.id)}
                            className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground/30 hover:text-destructive transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Semantic search */}
        <div className={cn(CARD.base, 'p-6')}>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-chart-2/10 ring-1 ring-chart-2/20">
              <Search className="w-4 h-4 text-chart-2" strokeWidth={2} />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-card-foreground">Semantic Search</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {selectedCol ? `Searching in ${selectedCol.name}` : 'Searching all collections'} · keyword match (pgvector when active)
              </p>
            </div>
          </div>
          <div className="flex gap-3 mb-4">
            <input
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder='e.g. "how does FormValidator handle null inputs?"'
              className="flex-1 bg-muted/30 border border-border rounded-lg px-4 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:ring-1 focus:ring-primary/40" />
            <button onClick={handleSearch} disabled={searching || !searchQ.trim()}
              className="flex items-center gap-2 px-5 py-2.5 text-[13px] font-semibold bg-primary/90 hover:bg-primary text-white rounded-lg transition-colors disabled:opacity-50">
              {searching ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              Search
            </button>
          </div>
          {searchResults !== null && (
            searchResults.length === 0 ? (
              <div className="text-[13px] text-muted-foreground text-center py-4">No results found</div>
            ) : (
              <div className="space-y-3">
                {searchResults.map((r, i) => (
                  <div key={i} className="p-4 rounded-xl bg-muted/30 border border-border">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[11px] font-semibold text-card-foreground">{r.document_name}</span>
                      <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        score: {r.score.toFixed(2)}
                      </span>
                    </div>
                    <p className="text-[12px] text-muted-foreground leading-relaxed">{r.snippet}</p>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

      </PageBody>
    </PageLayout>
  );
}
