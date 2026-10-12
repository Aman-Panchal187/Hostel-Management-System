import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock, ListTodo, PlayCircle, Plus } from 'lucide-react';
import { ErrorState, PageHeader, StatCard } from '@/components/common/common';
import { Card, CardHeader } from '@/components/ui/card';
import { useAuth } from '@/features/auth/AuthContext';
import { IssuesTable } from '@/features/issues/IssuesPage';
import { analyticsApi } from '@/services/endpoints';

export function useMySummary() {
  return useQuery({ queryKey: ['analytics', 'me'], queryFn: analyticsApi.me });
}

export function StudentDashboard() {
  const { user } = useAuth();
  const query = useMySummary();
  const s = query.data;
  return (
    <>
      <PageHeader
        title={`Hello, ${user?.name.split(' ')[0] ?? ''}`}
        description={`${user?.hostel?.name ?? ''}${user?.roomNumber ? ` · Room ${user.roomNumber}` : ''}`}
        actions={
          <Link to="/student/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-primary/80 px-4 text-sm font-medium text-white shadow-glow">
            <Plus className="h-4 w-4" aria-hidden /> Report an issue
          </Link>
        }
      />
      {query.isError ? (
        <Card>
          <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
        </Card>
      ) : (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard testId="kpi-total" label="My issues" value={s?.total} icon={ListTodo} loading={!s} />
          <StatCard testId="kpi-open" label="Open" value={s?.open} icon={Clock} tone="warning" loading={!s} />
          <StatCard testId="kpi-progress" label="In progress" value={s?.inProgress} icon={PlayCircle} loading={!s} />
          <StatCard testId="kpi-done" label="Resolved" value={s?.done} icon={CheckCircle2} tone="success" loading={!s} />
        </div>
      )}
      <Card>
        <CardHeader
          title="Recent issues"
          action={
            <Link to="/student/issues" className="text-sm text-accent hover:underline">
              View all
            </Link>
          }
        />
        <IssuesTable filters={{ pageSize: 6 }} />
      </Card>
    </>
  );
}

export function AssistantDashboard() {
  const { user } = useAuth();
  const query = useMySummary();
  const s = query.data;
  return (
    <>
      <PageHeader title={`Hello, ${user?.name.split(' ')[0] ?? ''}`} description={`Your work summary at ${user?.hostel?.name ?? 'your hostel'}`} />
      {query.isError ? (
        <Card>
          <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
        </Card>
      ) : (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard testId="kpi-total" label="Assigned issues" value={s?.total} icon={ListTodo} loading={!s} />
          <StatCard testId="kpi-yet" label="Yet to start" value={s?.yetToStart} icon={Clock} tone="warning" loading={!s} />
          <StatCard testId="kpi-progress" label="In progress" value={s?.inProgress} icon={PlayCircle} loading={!s} />
          <StatCard testId="kpi-done" label="Completed" value={s?.done} icon={CheckCircle2} tone="success" loading={!s} />
        </div>
      )}
      <Card>
        <CardHeader
          title="Needs your attention"
          action={
            <Link to="/assistant/issues" className="text-sm text-accent hover:underline">
              View all
            </Link>
          }
        />
        <IssuesTable filters={{ pageSize: 6, sortBy: 'priority', sortDir: 'desc' }} />
      </Card>
    </>
  );
}
