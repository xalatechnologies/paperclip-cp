/**
 * Design Tokens
 * Single source of truth for all design values used across the web app.
 * All Tailwind class strings are composed here — no ad-hoc styling in page components.
 */

// ─── Status ────────────────────────────────────────────────────────────────

export type AgentStatus = 'active' | 'idle' | 'error' | 'paused';

export const STATUS_BADGE: Record<string, { dot: string; badge: string; label: string }> = {
  active:  { dot: 'bg-success animate-pulse', badge: 'bg-success/10 text-success',         label: 'active' },
  idle:    { dot: 'bg-muted-foreground/40',    badge: 'bg-muted text-muted-foreground',      label: 'idle' },
  error:   { dot: 'bg-destructive',            badge: 'bg-destructive/10 text-destructive',  label: 'error' },
  paused:  { dot: 'bg-warning',                badge: 'bg-warning/10 text-warning',          label: 'paused' },
};

export function getStatusConfig(status: string) {
  return STATUS_BADGE[status] ?? STATUS_BADGE.idle;
}

// ─── Stat card icon rings ───────────────────────────────────────────────────

export const ICON_RINGS = {
  primary:     'ring-primary/20 bg-primary/8',
  success:     'ring-success/20 bg-success/8',
  destructive: 'ring-destructive/20 bg-destructive/8',
  warning:     'ring-warning/20 bg-warning/8',
  info:        'ring-info/20 bg-info/8',
  muted:       'ring-border bg-muted',
  chart2:      'ring-chart-2/20 bg-chart-2/8',
} as const;

// ─── Typography ────────────────────────────────────────────────────────────

export const TEXT = {
  pageTitle:    'text-[22px] font-bold text-card-foreground tracking-tight',
  pageSub:      'text-sm text-muted-foreground',
  sectionTitle: 'text-[15px] font-bold text-card-foreground tracking-tight',
  sectionSub:   'text-[13px] text-muted-foreground',
  label:        'text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.06em]',
  sidebarLabel: 'text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-[0.08em]',
  statValue:    'text-3xl font-bold tracking-tight',
  tableHead:    'text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.06em]',
  tableCell:    'text-[14px] text-card-foreground',
  tableSub:     'text-[11px] text-muted-foreground mt-0.5',
  mono:         'font-mono text-[11px] text-muted-foreground',
  link:         'text-[13px] font-semibold text-primary no-underline hover:text-primary/80 transition-colors',
  viewAll:      'flex items-center gap-1 text-[13px] font-semibold text-primary no-underline hover:text-primary/80 transition-colors',
} as const;

// ─── Layout ────────────────────────────────────────────────────────────────

export const LAYOUT = {
  pageHeader:  'px-8 py-5 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-40',
  pageBody:    'flex-1 p-8 overflow-y-auto space-y-8',
  rightSidebar: 'w-[260px] border-l border-border bg-sidebar/40 p-6 flex flex-col gap-6 flex-shrink-0 overflow-y-auto hidden xl:flex',
  sidebarDivider: 'h-px bg-border flex-shrink-0',
} as const;

// ─── Cards & Surfaces ──────────────────────────────────────────────────────

export const CARD = {
  base:   'bg-card border border-border rounded-xl',
  hover:  'bg-card border border-border rounded-xl hover:shadow-md hover:border-border/60 transition-all duration-200',
  stat:   'bg-card border border-border rounded-xl p-5 hover:shadow-sm transition-shadow',
  table:  'bg-card border border-border rounded-xl overflow-hidden',
  panel:  'bg-muted/30 border border-border rounded-xl p-4',
} as const;

// ─── Table ─────────────────────────────────────────────────────────────────

export const TABLE = {
  th:   'text-left px-5 py-3.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.06em] bg-muted/30',
  thRight: 'text-right px-5 py-3.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.06em] bg-muted/30',
  td:   'px-5 py-4 border-b border-border/40',
  tdRight: 'px-5 py-4 border-b border-border/40 text-right',
  row:  'last:[&>td]:border-0 hover:bg-muted/25 transition-colors',
} as const;

// ─── Helpers ───────────────────────────────────────────────────────────────

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}
