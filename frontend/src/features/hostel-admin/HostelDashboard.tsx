import { Link } from 'react-router-dom';
import { CheckCircle2, Clock, ListTodo, PlayCircle, ShieldCheck } from 'lucide-react';
import { AssistantChart, CategoryBars, StatusDonut, TrendChart } from '@/components/charts/charts';
import { ErrorState, PageHeader, StatCard } from '@/components/common/common';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { useAuth } from '@/features/auth/AuthContext';
import { IssuesTable } from '@/features/issues/IssuesPage';
import { defaultRange } from '@/features/analytics/DateRangeFilter';
import { useHostelAnalytics } from './HostelAnalyticsPage';

export default function HostelDashboard() {
  const { user } = useAuth();
  const range = defaultRange();
  const query = useHostelAnalytics(range);
  const data = query.data;
  const k = data?.kpis;

  return (
    <>
      <PageHeader title={user?.hostel?.name ?? 'Dashboard'} description="Last 90 days. Open Analytics for filters and PDF export." />
      {query.isError && !data ? (
        <Card>
          <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <StatCard testId="kpi-total" label="Total issues" value={k?.total} icon={ListTodo} loading={!k} />
            <StatCard testId="kpi-yet" label="Yet to start" value={k?.yetToStart} icon={Clock} tone="warning" loading={!k} />
            <StatCard testId="kpi-progress" label="In progress" value={k?.inProgress} icon={PlayCircle} loading={!k} />
            <StatCard testId="kpi-done" label="Done" value={k?.done} icon={CheckCircle2} tone="success" loading={!k} />
            <StatCard testId="kpi-approvals" label="Pending approvals" value={k?.pendingApprovals} icon={ShieldCheck} tone="accent" loading={!k} hint="Students & assistants" />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader title="Status" />
              <CardBody>{data && <StatusDonut data={data.byStatus} />}</CardBody>
            </Card>
            <Card>
              <CardHeader title="By category" />
              <CardBody>{data && <CategoryBars data={data.byCategory} label="Issues by category" />}</CardBody>
            </Card>
            <Card>
              <CardHeader title="Assistant workload" />
              <CardBody>{data && <AssistantChart data={data.assistants} />}</CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader title="Issue trend" description="Created vs resolved per day" />
            <CardBody>{data && <TrendChart created={data.createdOverTime} resolved={data.resolvedOverTime} />}</CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Recent issues"
              description="Assign new work to your assistants"
              action={
                <Link to="/hostel/issues" className="text-sm text-accent hover:underline">
                  View all
                </Link>
              }
            />
            <IssuesTable filters={{ pageSize: 6, sortBy: 'createdAt', sortDir: 'desc' }} showAssign />
          </Card>
        </div>
      )}
    </>
  );
}
