import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock, ListTodo, Percent, PlayCircle, Timer } from 'lucide-react';
import { AssistantChart, CategoryBars, StatusDonut, TrendChart } from '@/components/charts/charts';
import { ErrorState, PageHeader, StatCard } from '@/components/common/common';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Select } from '@/components/ui/form';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { useAuth } from '@/features/auth/AuthContext';
import { DateRangeFilter, defaultRange } from '@/features/analytics/DateRangeFilter';
import { ExportPdfButton } from '@/features/analytics/ExportButton';
import { useAssistants } from '@/features/issues/AssignControl';
import { analyticsApi } from '@/services/endpoints';
import type { IssueCategory, IssueStatus } from '@/types';
import { CATEGORY_LABEL, formatDate, formatHours, ISSUE_CATEGORIES, ISSUE_STATUSES, rangeToIso, STATUS_LABEL } from '@/utils/format';

export function useHostelAnalytics(filters: { from: string; to: string; status?: IssueStatus | ''; category?: IssueCategory | ''; assigneeId?: string }) {
  const range = rangeToIso(filters.from, filters.to);
  const params = { ...range, status: filters.status, category: filters.category, assigneeId: filters.assigneeId };
  return useQuery({ queryKey: ['analytics', 'hostel', params], queryFn: () => analyticsApi.hostel(params), placeholderData: (prev) => prev });
}

export default function HostelAnalyticsPage() {
  const { user } = useAuth();
  const [range, setRange] = useState(defaultRange);
  const [status, setStatus] = useState<IssueStatus | ''>('');
  const [category, setCategory] = useState<IssueCategory | ''>('');
  const [assigneeId, setAssigneeId] = useState('');
  const { data: assistants = [] } = useAssistants();
  const query = useHostelAnalytics({ ...range, status, category, assigneeId });
  const reportRef = useRef<HTMLDivElement>(null);
  const data = query.data;

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Issue trends, categories and assistant performance for your hostel."
        actions={
          <ExportPdfButton
            disabled={!data}
            getReport={() =>
              data && reportRef.current
                ? {
                    title: 'Hostel Issue Report',
                    subject: user?.hostel?.name ?? 'Hostel',
                    rangeLabel: `${formatDate(range.from)} – ${formatDate(range.to)}`,
                    kpis: [
                      { label: 'Total issues', value: String(data.kpis.total) },
                      { label: 'Yet to start', value: String(data.kpis.yetToStart) },
                      { label: 'In progress', value: String(data.kpis.inProgress) },
                      { label: 'Done', value: String(data.kpis.done) },
                      { label: 'Completion rate', value: `${data.kpis.completionRate}%` },
                      { label: 'Avg resolution', value: formatHours(data.kpis.avgResolutionHours) },
                    ],
                    element: reportRef.current,
                    filename: `hostel-report-${range.to}.pdf`,
                  }
                : null
            }
          />
        }
      />

      <Card className="mb-6">
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <DateRangeFilter value={range} onChange={setRange} />
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as IssueStatus | '')}>
              <option value="">All statuses</option>
              {ISSUE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Category">
            <Select value={category} onChange={(e) => setCategory(e.target.value as IssueCategory | '')}>
              <option value="">All categories</option>
              {ISSUE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Assistant">
            <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">All assistants</option>
              {assistants.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      {query.isError && !data ? (
        <Card>
          <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
        </Card>
      ) : (
        <div ref={reportRef} className="space-y-6 bg-background p-1" data-testid="analytics-report">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard testId="kpi-total" label="Total issues" value={data?.kpis.total} icon={ListTodo} loading={!data} />
            <StatCard testId="kpi-yet" label="Yet to start" value={data?.kpis.yetToStart} icon={Clock} tone="warning" loading={!data} />
            <StatCard testId="kpi-progress" label="In progress" value={data?.kpis.inProgress} icon={PlayCircle} tone="primary" loading={!data} />
            <StatCard testId="kpi-done" label="Done" value={data?.kpis.done} icon={CheckCircle2} tone="success" loading={!data} />
            <StatCard testId="kpi-rate" label="Completion rate" value={data ? `${data.kpis.completionRate}%` : ''} icon={Percent} tone="accent" loading={!data} />
            <StatCard testId="kpi-avg" label="Avg resolution" value={data ? formatHours(data.kpis.avgResolutionHours) : ''} icon={Timer} tone="accent" loading={!data} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card data-pdf-block>
              <CardHeader title="Status distribution" />
              <CardBody>{data && <StatusDonut data={data.byStatus} />}</CardBody>
            </Card>
            <Card data-pdf-block>
              <CardHeader title="Issues by category" />
              <CardBody>{data && <CategoryBars data={data.byCategory} label="Issues by category" />}</CardBody>
            </Card>
            <Card data-pdf-block>
              <CardHeader title="Issues by priority" />
              <CardBody>{data && <CategoryBars data={data.byPriority} label="Issues by priority" />}</CardBody>
            </Card>
            <Card data-pdf-block>
              <CardHeader title="Created vs resolved" description="Per day" />
              <CardBody>{data && <TrendChart created={data.createdOverTime} resolved={data.resolvedOverTime} />}</CardBody>
            </Card>
          </div>

          <Card data-pdf-block>
            <CardHeader title="Assistant performance" description="Assigned vs completed within the selected filters" />
            <CardBody>{data && <AssistantChart data={data.assistants} />}</CardBody>
            {data && (
              <Table aria-label="Assistant performance">
                <THead>
                  <tr>
                    <Th>Assistant</Th>
                    <Th className="text-right">Assigned</Th>
                    <Th className="text-right">In progress</Th>
                    <Th className="text-right">Completed</Th>
                    <Th className="text-right">Completion</Th>
                    <Th className="text-right">Avg resolution</Th>
                  </tr>
                </THead>
                <TBody>
                  {data.assistants.map((a) => (
                    <Tr key={a.id}>
                      <Td className="font-medium">{a.name}</Td>
                      <Td className="text-right tabular-nums">{a.assigned}</Td>
                      <Td className="text-right tabular-nums">{a.inProgress}</Td>
                      <Td className="text-right tabular-nums">{a.completed}</Td>
                      <Td className="text-right tabular-nums">{a.completionRate}%</Td>
                      <Td className="text-right tabular-nums">{formatHours(a.avgResolutionHours)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
