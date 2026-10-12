import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { EmptyState, ErrorState, PageHeader, Pagination, PriorityBadge, StatusBadge, TableSkeleton } from '@/components/common/common';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/form';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { useAuth } from '@/features/auth/AuthContext';
import { issuesApi } from '@/services/endpoints';
import type { IssueCategory, IssueFilters, IssuePriority, IssueStatus } from '@/types';
import { CATEGORY_LABEL, formatDate, ISSUE_CATEGORIES, ISSUE_PRIORITIES, ISSUE_STATUSES, PRIORITY_LABEL, STATUS_LABEL } from '@/utils/format';
import { AssignControl, useAssistants } from './AssignControl';

const ASSIGNEE_ALL = '';
const ASSIGNEE_NONE = 'unassigned';

/** Also embedded (limited) in dashboards via IssuesTable. */
export function IssuesTable({ filters, onPage, showAssign, empty }: Readonly<{ filters: IssueFilters; onPage?: (p: number) => void; showAssign?: boolean; empty?: React.ReactNode }>) {
  const query = useQuery({ queryKey: ['issues', filters], queryFn: () => issuesApi.list(filters), placeholderData: (prev) => prev });
  if (query.isLoading) return <TableSkeleton />;
  if (query.isError) return <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />;
  const { data, meta } = query.data!;
  if (data.length === 0) return <>{empty ?? <EmptyState title="No issues found" description="Try changing the filters, or check back later." />}</>;
  return (
    <>
      <Table aria-label="Issues">
        <THead>
          <tr>
            <Th>Issue</Th>
            <Th>Room</Th>
            <Th>Category</Th>
            <Th>Priority</Th>
            <Th>Status</Th>
            <Th>Assignee</Th>
            <Th>Created</Th>
          </tr>
        </THead>
        <TBody>
          {data.map((issue) => (
            <Tr key={issue.id}>
              <Td className="max-w-[16rem]">
                <Link to={`/issues/${issue.id}`} className="block truncate font-medium text-foreground hover:text-accent">
                  {issue.title}
                </Link>
                <span className="text-xs text-muted">by {issue.reporter.name}</span>
              </Td>
              <Td>{issue.room?.number ?? '—'}</Td>
              <Td>{CATEGORY_LABEL[issue.category]}</Td>
              <Td>
                <PriorityBadge priority={issue.priority} />
              </Td>
              <Td>
                <StatusBadge status={issue.status} />
              </Td>
              <Td>
                {showAssign ? <AssignControl compact issueId={issue.id} currentAssigneeId={issue.assignee?.id ?? null} disabled={issue.status === 'DONE'} /> : (issue.assignee?.name ?? <span className="text-muted">Unassigned</span>)}
              </Td>
              <Td className="whitespace-nowrap text-muted">{formatDate(issue.createdAt)}</Td>
            </Tr>
          ))}
        </TBody>
      </Table>
      {onPage && <Pagination meta={meta} onPage={onPage} />}
    </>
  );
}

export default function IssuesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'HOSTEL_ADMIN';
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<IssueStatus | ''>('');
  const [priority, setPriority] = useState<IssuePriority | ''>('');
  const [category, setCategory] = useState<IssueCategory | ''>('');
  const [assignee, setAssignee] = useState(ASSIGNEE_ALL);
  const [sort, setSort] = useState<'createdAt' | 'priority' | 'status'>('createdAt');
  const [page, setPage] = useState(1);
  const { data: assistants = [] } = useAssistants();

  const filters: IssueFilters = {
    page,
    pageSize: 10,
    search: search.trim() || undefined,
    status,
    priority,
    category,
    assigneeId: assignee && assignee !== ASSIGNEE_NONE ? assignee : undefined,
    unassigned: assignee === ASSIGNEE_NONE || undefined,
    sortBy: sort,
    sortDir: 'desc',
  };
  const reset = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title={isAdmin ? 'Issues' : user?.role === 'ASSISTANT' ? 'My assigned issues' : 'My issues'}
        description={isAdmin ? 'Everything reported in your hostel. Assign work to your assistants.' : undefined}
        actions={
          user?.role === 'STUDENT' && (
            <Link to="/student/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-primary/80 px-4 text-sm font-medium text-white shadow-glow">
              <Plus className="h-4 w-4" aria-hidden /> Report an issue
            </Link>
          )
        }
      />
      <Card>
        <div className="grid gap-3 border-b border-border/60 p-4 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted" aria-hidden />
            <Input aria-label="Search issues" className="pl-9" placeholder="Search by title" value={search} onChange={(e) => reset(setSearch)(e.target.value)} />
          </div>
          <Select aria-label="Filter by status" value={status} onChange={(e) => reset(setStatus)(e.target.value as IssueStatus | '')}>
            <option value="">All statuses</option>
            {ISSUE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
          <Select aria-label="Filter by priority" value={priority} onChange={(e) => reset(setPriority)(e.target.value as IssuePriority | '')}>
            <option value="">All priorities</option>
            {ISSUE_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </Select>
          <Select aria-label="Filter by category" value={category} onChange={(e) => reset(setCategory)(e.target.value as IssueCategory | '')}>
            <option value="">All categories</option>
            {ISSUE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
          {isAdmin ? (
            <Select aria-label="Filter by assistant" value={assignee} onChange={(e) => reset(setAssignee)(e.target.value)}>
              <option value={ASSIGNEE_ALL}>All assistants</option>
              <option value={ASSIGNEE_NONE}>Unassigned</option>
              {assistants.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          ) : (
            <Select aria-label="Sort by" value={sort} onChange={(e) => reset(setSort)(e.target.value as typeof sort)}>
              <option value="createdAt">Newest first</option>
              <option value="priority">Priority</option>
              <option value="status">Status</option>
            </Select>
          )}
        </div>
        <IssuesTable filters={filters} onPage={setPage} showAssign={isAdmin} />
      </Card>
    </>
  );
}
