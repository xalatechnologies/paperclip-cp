import Link from 'next/link';
import { ArrowUpRight, ChevronRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TEXT, LAYOUT, CARD, TABLE, ICON_RINGS, getStatusConfig, fmtTokens } from '@/lib/tokens';

// ─── PageHeader ────────────────────────────────────────────────────────────

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: { label: string; href: string };
  badge?: React.ReactNode;
}

export function PageHeader({ title, subtitle, action, badge }: PageHeaderProps) {
  return (
    <div className={LAYOUT.pageHeader}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className={TEXT.pageTitle}>{title}</h1>
          {subtitle && <p className={cn(TEXT.pageSub, 'mt-0.5')}>{subtitle}</p>}
        </div>
        <div className="flex items-center gap-3">
          {badge}
          {action && (
            <Link href={action.href as any} className={TEXT.viewAll}>
              {action.label} <ArrowUpRight size={13} />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── StatCard ──────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: LucideIcon;
  color: string;       // text-* class
  ring?: keyof typeof ICON_RINGS;
  href?: string;
}

function StatCardInner({ label, value, sub, icon: Icon, color, ring = 'muted' }: Omit<StatCardProps, 'href'>) {
  return (
    <div className={CARD.stat}>
      <div className="flex items-center justify-between mb-4">
        <span className={TEXT.label}>{label}</span>
        <div className={cn('p-2 rounded-lg ring-1', ICON_RINGS[ring])}>
          <Icon className={cn('w-3.5 h-3.5', color)} strokeWidth={2} />
        </div>
      </div>
      <div className={cn(TEXT.statValue, color)} style={{ letterSpacing: '-0.04em' }}>
        {value}
      </div>
      {sub && <div className={cn('text-[13px] font-medium mt-2', 'text-muted-foreground')}>{sub}</div>}
    </div>
  );
}

export function StatCard({ href, ...props }: StatCardProps) {
  if (href) {
    return (
      <Link href={href as any} className="no-underline group">
        <div className={cn(CARD.stat, 'group-hover:-translate-y-px group-hover:shadow-md transition-all duration-200')}>
          <div className="flex items-center justify-between mb-4">
            <span className={TEXT.label}>{props.label}</span>
            <div className={cn('p-2 rounded-lg ring-1', ICON_RINGS[props.ring ?? 'muted'])}>
              <props.icon className={cn('w-3.5 h-3.5', props.color)} strokeWidth={2} />
            </div>
          </div>
          <div className={cn(TEXT.statValue, props.color)} style={{ letterSpacing: '-0.04em' }}>
            {props.value}
          </div>
          {props.sub && <div className="text-[13px] font-medium mt-2 text-muted-foreground">{props.sub}</div>}
        </div>
      </Link>
    );
  }
  return <StatCardInner {...props} />;
}

// ─── StatGrid ──────────────────────────────────────────────────────────────

export function StatGrid({ children, cols = 5 }: { children: React.ReactNode; cols?: number }) {
  const colClass: Record<number, string> = {
    2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4', 5: 'grid-cols-5',
  };
  return <div className={cn('grid gap-4', colClass[cols] ?? 'grid-cols-5')}>{children}</div>;
}

// ─── SectionHeader ─────────────────────────────────────────────────────────

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  href?: string;
  linkLabel?: string;
}

export function SectionHeader({ title, subtitle, href, linkLabel = 'View all' }: SectionHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div>
        <h2 className={TEXT.sectionTitle}>{title}</h2>
        {subtitle && <p className={cn(TEXT.sectionSub, 'mt-0.5')}>{subtitle}</p>}
      </div>
      {href && (
        <Link href={href as any} className={TEXT.viewAll}>
          {linkLabel} <ArrowUpRight size={12} />
        </Link>
      )}
    </div>
  );
}

// ─── StatusBadge ───────────────────────────────────────────────────────────

export function StatusBadge({ status }: { status: string }) {
  const cfg = getStatusConfig(status);
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-md', cfg.badge)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
      {status}
    </span>
  );
}

// ─── MonoBadge ─────────────────────────────────────────────────────────────

export function MonoBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
      {children}
    </span>
  );
}

// ─── AlertBanner ───────────────────────────────────────────────────────────

interface AlertBannerProps {
  icon: LucideIcon;
  title: string;
  detail?: string;
  href?: string;
  linkLabel?: string;
  variant?: 'error' | 'warning' | 'info';
}

const ALERT_VARIANTS = {
  error:   { wrapper: 'bg-destructive/5 border-destructive/15', icon: 'bg-destructive/10', iconColor: 'text-destructive', text: 'text-destructive', sub: 'text-destructive/70' },
  warning: { wrapper: 'bg-warning/5 border-warning/15',         icon: 'bg-warning/10',     iconColor: 'text-warning',     text: 'text-warning',     sub: 'text-warning/70' },
  info:    { wrapper: 'bg-info/5 border-info/15',               icon: 'bg-info/10',         iconColor: 'text-info',        text: 'text-info',        sub: 'text-info/70' },
};

export function AlertBanner({ icon: Icon, title, detail, href, linkLabel = 'View', variant = 'error' }: AlertBannerProps) {
  const v = ALERT_VARIANTS[variant];
  return (
    <div className={cn('flex items-start gap-3 p-4 rounded-xl border', v.wrapper)}>
      <div className={cn('p-1.5 rounded-md flex-shrink-0 mt-0.5', v.icon)}>
        <Icon size={14} className={v.iconColor} />
      </div>
      <div className="flex-1 min-w-0">
        <div className={cn('text-sm font-semibold', v.text)}>{title}</div>
        {detail && <div className={cn('text-xs mt-0.5', v.sub)}>{detail}</div>}
      </div>
      {href && (
        <Link href={href as any} className={cn('flex items-center gap-1 text-xs font-semibold no-underline flex-shrink-0 mt-0.5', v.text)}>
          {linkLabel} <ArrowUpRight size={12} />
        </Link>
      )}
    </div>
  );
}

// ─── DataTable ─────────────────────────────────────────────────────────────

interface Column {
  key: string;
  label: string;
  align?: 'left' | 'right';
}

interface DataTableProps {
  columns: Column[];
  children: React.ReactNode;
  empty?: { icon: LucideIcon; message: string };
  hasRows?: boolean;
}

export function DataTable({ columns, children, empty, hasRows = true }: DataTableProps) {
  return (
    <div className={CARD.table}>
      {!hasRows && empty ? (
        <div className="py-16 text-center">
          <empty.icon size={28} className="text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">{empty.message}</p>
        </div>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border">
              {columns.map(col => (
                <th
                  key={col.key}
                  className={col.align === 'right' ? TABLE.thRight : TABLE.th}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      )}
    </div>
  );
}

// ─── TableRow / TableCell ──────────────────────────────────────────────────

export function TR({ children }: { children: React.ReactNode }) {
  return <tr className={TABLE.row}>{children}</tr>;
}

export function TD({ children, right, mono, sub, className }: {
  children?: React.ReactNode;
  right?: boolean;
  mono?: boolean;
  sub?: React.ReactNode;
  className?: string;
}) {
  return (
    <td className={cn(right ? TABLE.tdRight : TABLE.td, className)}>
      {mono ? (
        <span className={TEXT.mono}>{children}</span>
      ) : sub ? (
        <div>
          <div className={TEXT.tableCell}>{children}</div>
          <div className={TEXT.tableSub}>{sub}</div>
        </div>
      ) : (
        <span className={TEXT.tableCell}>{children}</span>
      )}
    </td>
  );
}

// ─── RightSidebar ──────────────────────────────────────────────────────────

export function RightSidebar({ children }: { children: React.ReactNode }) {
  return <div className={LAYOUT.rightSidebar}>{children}</div>;
}

// ─── SidebarSection ────────────────────────────────────────────────────────

export function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex-shrink-0">
      <div className={cn(TEXT.sidebarLabel, 'mb-3')}>{title}</div>
      {children}
    </div>
  );
}

export function SidebarDivider() {
  return <div className={LAYOUT.sidebarDivider} />;
}

// ─── SidebarRow ────────────────────────────────────────────────────────────

export function SidebarRow({ label, value, valueClass }: { label: string; value: React.ReactNode; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className={cn('text-[13px] font-semibold tabular-nums', valueClass ?? 'text-card-foreground')}>
        {value}
      </span>
    </div>
  );
}

// ─── MiniProgressBar ───────────────────────────────────────────────────────

export function MiniProgressBar({ value, max, colorClass = 'bg-primary/50', height = 'h-1.5' }: {
  value: number; max: number; colorClass?: string; height?: string;
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className={cn('bg-muted rounded-full overflow-hidden', height)}>
      <div className={cn('h-full rounded-full transition-all duration-700', colorClass)} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─── SidebarMetricCard ─────────────────────────────────────────────────────

export function SidebarMetricCard({ label, value, valueClass, bar, barColor }: {
  label: string;
  value: string | number;
  valueClass?: string;
  bar?: { value: number; max: number };
  barColor?: string;
}) {
  return (
    <div className={CARD.panel}>
      <div className="text-[11px] text-muted-foreground font-medium mb-1.5">{label}</div>
      <div className={cn('text-[28px] font-bold mb-2', valueClass ?? 'text-card-foreground')} style={{ letterSpacing: '-0.05em' }}>
        {value}
      </div>
      {bar && <MiniProgressBar value={bar.value} max={bar.max} colorClass={barColor} height="h-2" />}
    </div>
  );
}

// ─── SidebarNavLink ────────────────────────────────────────────────────────

export function SidebarNavLink({ href, label, sub, icon: Icon }: {
  href: string;
  label: string;
  sub?: string;
  icon: LucideIcon;
}) {
  return (
    <Link href={href as any} className="group flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/60 transition-all no-underline -mx-1">
      <Icon className="w-4 h-4 text-muted-foreground/50 group-hover:text-primary transition-colors flex-shrink-0" strokeWidth={1.8} />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-foreground leading-none mb-0.5">{label}</div>
        {sub && <div className="text-[11px] text-muted-foreground/60">{sub}</div>}
      </div>
      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/20 group-hover:text-muted-foreground/60 transition-colors" />
    </Link>
  );
}

// ─── EmptyState ────────────────────────────────────────────────────────────

export function EmptyState({ icon: Icon, title, description }: {
  icon: LucideIcon;
  title: string;
  description?: string;
}) {
  return (
    <div className={cn(CARD.table, 'py-20 text-center')}>
      <Icon size={32} className="text-muted-foreground/15 mx-auto mb-4" />
      <div className="text-[15px] font-medium text-muted-foreground">{title}</div>
      {description && <p className="text-[13px] text-muted-foreground/60 mt-1 max-w-xs mx-auto">{description}</p>}
    </div>
  );
}

// ─── PageLayout ────────────────────────────────────────────────────────────

export function PageLayout({ children, sidebar }: { children: React.ReactNode; sidebar?: React.ReactNode }) {
  return (
    <div className="flex flex-1 min-h-0">
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
      {sidebar}
    </div>
  );
}

export function PageBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn(LAYOUT.pageBody, className)}>{children}</div>;
}
