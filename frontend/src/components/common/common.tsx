import type { ComponentType, ReactNode } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Film, Inbox } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { Tone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { ApprovalStatus, IssueAttachment, IssuePriority, IssueStatus, PageMeta } from '@/types';
import { PRIORITY_LABEL, STATUS_LABEL } from '@/utils/format';
import { cn } from '@/utils/cn';

const STATUS_TONE: Record<IssueStatus, Tone> = { YET_TO_START: 'warning', IN_PROGRESS: 'primary', DONE: 'success' };
const PRIORITY_TONE: Record<IssuePriority, Tone> = { LOW: 'neutral', MEDIUM: 'accent', HIGH: 'warning', URGENT: 'danger' };
const APPROVAL_TONE: Record<ApprovalStatus, Tone> = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger' };

export const StatusBadge = ({ status }: Readonly<{ status: IssueStatus }>) => <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
export const PriorityBadge = ({ priority }: Readonly<{ priority: IssuePriority }>) => <Badge tone={PRIORITY_TONE[priority]}>{PRIORITY_LABEL[priority]}</Badge>;
export const ApprovalBadge = ({ status }: Readonly<{ status: ApprovalStatus }>) => <Badge tone={APPROVAL_TONE[status]}>{status.charAt(0) + status.slice(1).toLowerCase()}</Badge>;

export function PageHeader({ title, description, actions }: Readonly<{ title: string; description?: string; actions?: ReactNode }>) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon: ComponentType<{ className?: string }>;
  tone?: 'primary' | 'accent' | 'success' | 'warning' | 'danger';
  hint?: string;
  loading?: boolean;
  testId?: string;
}

const iconTone = { primary: 'bg-primary/15 text-primary', accent: 'bg-accent/15 text-accent', success: 'bg-success/15 text-success', warning: 'bg-warning/15 text-warning', danger: 'bg-danger/15 text-danger' };

export function StatCard({ label, value, icon: Icon, tone = 'primary', hint, loading, testId }: Readonly<StatCardProps>) {
  return (
    <Card className="animate-fade-up p-4 transition-transform duration-200 hover:-translate-y-0.5" data-testid={testId}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{label}</p>
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', iconTone[tone])}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
      {loading ? <Skeleton className="mt-3 h-8 w-16" /> : <p className="mt-2 text-3xl font-semibold tabular-nums" data-testid={testId ? `${testId}-value` : undefined}>{value}</p>}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  );
}

export function EmptyState({ title, description, action }: Readonly<{ title: string; description?: string; action?: ReactNode }>) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-card text-muted">
        <Inbox className="h-6 w-6" aria-hidden />
      </span>
      <p className="font-medium">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: Readonly<{ message: string; onRetry?: () => void }>) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <AlertTriangle className="mb-2 h-8 w-8 text-danger" aria-hidden />
      <p className="font-medium">Something went wrong</p>
      <p className="mt-1 text-sm text-muted">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: Readonly<{ rows?: number }>) {
  return (
    <div className="space-y-3 p-5" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-9" />
      ))}
    </div>
  );
}

export function Pagination({ meta, onPage }: Readonly<{ meta: PageMeta; onPage: (page: number) => void }>) {
  if (meta.total === 0) return null;
  const from = (meta.page - 1) * meta.pageSize + 1;
  const to = Math.min(meta.total, meta.page * meta.pageSize);
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-3 text-sm text-muted">
      <span>
        {from}–{to} of {meta.total}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" aria-label="Previous page" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span aria-current="page">
          {meta.page} / {meta.totalPages}
        </span>
        <Button variant="outline" size="icon" aria-label="Next page" disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </nav>
  );
}

export function MediaGallery({ items, emptyLabel }: Readonly<{ items: IssueAttachment[]; emptyLabel: string }>) {
  if (items.length === 0) return <p className="text-sm text-muted">{emptyLabel}</p>;
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map((item) => (
        <li key={item.id} className="overflow-hidden rounded-lg border border-border bg-surface">
          {item.mediaType === 'IMAGE' ? (
            <a href={item.url} target="_blank" rel="noopener noreferrer" aria-label="Open image in a new tab">
              <img src={item.url} alt="Issue attachment" loading="lazy" referrerPolicy="no-referrer" className="aspect-video w-full object-cover" />
            </a>
          ) : (
            <video src={item.url} controls preload="metadata" className="aspect-video w-full bg-black" aria-label="Issue video attachment">
              <track kind="captions" />
              <Film className="h-4 w-4" />
            </video>
          )}
          <p className="truncate px-2 py-1 text-xs text-muted">{item.uploadedBy.name}</p>
        </li>
      ))}
    </ul>
  );
}

export function Logo({ className }: Readonly<{ className?: string }>) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent shadow-glow">
        <svg viewBox="0 0 32 32" className="h-5 w-5" aria-hidden>
          <path d="M6 16 16 7l10 9v9H19v-6h-6v6H6z" fill="#0B1120" />
        </svg>
      </span>
      <span className="text-lg font-semibold tracking-tight">
        Hostel<span className="gradient-text">Hub</span>
      </span>
    </div>
  );
}
