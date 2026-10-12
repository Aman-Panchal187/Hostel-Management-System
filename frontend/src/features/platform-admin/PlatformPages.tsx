import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Building2, CheckCircle2, Clock, GraduationCap, ListTodo, Users, Wrench } from 'lucide-react';
import { HostelComparisonChart, StatusDonut, TrendChart } from '@/components/charts/charts';
import { EmptyState, ErrorState, PageHeader, Pagination, StatCard, TableSkeleton, ApprovalBadge } from '@/components/common/common';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/form';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { ApprovalsTable } from '@/features/hostel-admin/ApprovalsPage';
import { DateRangeFilter, defaultRange } from '@/features/analytics/DateRangeFilter';
import { ExportPdfButton } from '@/features/analytics/ExportButton';
import { analyticsApi, hostelsApi } from '@/services/endpoints';
import type { ApprovalStatus } from '@/types';
import { formatDate, formatHours, rangeToIso } from '@/utils/format';

export function PlatformDashboard() {
  const [range, setRange] = useState(defaultRange);
  const [hostelId, setHostelId] = useState('');
  const params = { ...rangeToIso(range.from, range.to), hostelId: hostelId || undefined };
  const query = useQuery({ queryKey: ['analytics', 'platform', params], queryFn: () => analyticsApi.platform(params), placeholderData: (prev) => prev });
  const hostelsQuery = useQuery({ queryKey: ['hostels', { forFilter: true }], queryFn: () => hostelsApi.list({ status: 'APPROVED', pageSize: 100 }), staleTime: 60_000 });
  const reportRef = useRef<HTMLDivElement>(null);
  const data = query.data;
  const k = data?.kpis;

  return (
    <>
      <PageHeader
        title="Platform overview"
        description="All hostels at a glance."
        actions={
          <ExportPdfButton
            disabled={!data}
            getReport={() =>
              data && reportRef.current
                ? {
                    title: 'Platform Report',
                    subject: 'HostelHub — all hostels',
                    rangeLabel: `${formatDate(range.from)} – ${formatDate(range.to)}`,
                    kpis: [
                      { label: 'Total hostels', value: String(data.kpis.totalHostels) },
                      { label: 'Approved', value: String(data.kpis.approvedHostels) },
                      { label: 'Pending', value: String(data.kpis.pendingHostels) },
                      { label: 'Students', value: String(data.kpis.students) },
                      { label: 'Assistants', value: String(data.kpis.assistants) },
                      { label: 'Total issues', value: String(data.kpis.totalIssues) },
                      { label: 'Completion rate', value: `${data.kpis.completionRate}%` },
                    ],
                    element: reportRef.current,
                    filename: `platform-report-${range.to}.pdf`,
                  }
                : null
            }
          />
        }
      />

      <Card className="mb-6">
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <DateRangeFilter value={range} onChange={setRange} />
          <Field label="Hostel">
            <Select value={hostelId} onChange={(e) => setHostelId(e.target.value)}>
              <option value="">All hostels</option>
              {hostelsQuery.data?.data.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
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
        <div ref={reportRef} className="space-y-6 bg-background p-1">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard testId="kpi-hostels" label="Total hostels" value={k?.totalHostels} icon={Building2} loading={!k} />
            <StatCard testId="kpi-approved" label="Approved hostels" value={k?.approvedHostels} icon={CheckCircle2} tone="success" loading={!k} />
            <StatCard testId="kpi-pending" label="Pending approvals" value={k?.pendingHostels} icon={Clock} tone="warning" loading={!k} />
            <StatCard testId="kpi-issues" label="Total issues" value={k?.totalIssues} icon={ListTodo} tone="accent" loading={!k} />
            <StatCard testId="kpi-students" label="Students" value={k?.students} icon={GraduationCap} loading={!k} />
            <StatCard testId="kpi-assistants" label="Assistants" value={k?.assistants} icon={Wrench} tone="accent" loading={!k} />
            <StatCard testId="kpi-rate" label="Completion rate" value={k ? `${k.completionRate}%` : ''} icon={CheckCircle2} tone="success" loading={!k} />
            <StatCard label="Rejected hostels" value={k?.rejectedHostels} icon={Users} tone="danger" loading={!k} />
          </div>
          <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
            <Card data-pdf-block>
              <CardHeader title="Issue status" />
              <CardBody>{data && <StatusDonut data={data.byStatus} />}</CardBody>
            </Card>
            <Card data-pdf-block>
              <CardHeader title="Issues created" description="Per day, all selected hostels" />
              <CardBody>{data && <TrendChart created={data.createdOverTime} />}</CardBody>
            </Card>
          </div>
          <Card data-pdf-block>
            <CardHeader title="Hostel comparison" description="Issues by status per hostel" />
            <CardBody>{data && (data.hostels.length ? <HostelComparisonChart data={data.hostels} /> : <EmptyState title="No hostels" />)}</CardBody>
            {data && data.hostels.length > 0 && (
              <Table aria-label="Hostel comparison">
                <THead>
                  <tr>
                    <Th>Hostel</Th>
                    <Th className="text-right">Issues</Th>
                    <Th className="text-right">Done</Th>
                    <Th className="text-right">Completion</Th>
                    <Th className="text-right">Avg resolution</Th>
                  </tr>
                </THead>
                <TBody>
                  {data.hostels.map((h) => (
                    <Tr key={h.id}>
                      <Td>
                        <span className="font-medium">{h.name}</span> <span className="text-muted">· {h.city}</span>
                      </Td>
                      <Td className="text-right tabular-nums">{h.total}</Td>
                      <Td className="text-right tabular-nums">{h.done}</Td>
                      <Td className="text-right tabular-nums">{h.completionRate}%</Td>
                      <Td className="text-right tabular-nums">{formatHours(h.avgResolutionHours)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        </div>
      )}

      <Card className="mt-6">
        <CardHeader
          title="Pending hostel approvals"
          action={
            <Link to="/platform/approvals" className="text-sm text-accent hover:underline">
              View all
            </Link>
          }
        />
        <ApprovalsTable status="PENDING" pageSize={5} paged={false} title="Pending hostel approvals" />
      </Card>
    </>
  );
}

export function PlatformHostelsPage() {
  const [status, setStatus] = useState<ApprovalStatus | ''>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const params = { status: status || undefined, search: search.trim() || undefined, page, pageSize: 10 };
  const query = useQuery({ queryKey: ['hostels', params], queryFn: () => hostelsApi.list(params), placeholderData: (prev) => prev });
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  return (
    <>
      <PageHeader title="Hostels" description="Every registered hostel on the platform." />
      <Card>
        <div className="grid gap-3 border-b border-border/60 p-4 sm:grid-cols-2">
          <Input aria-label="Search hostels" placeholder="Search name or city" value={search} onChange={(e) => reset(setSearch)(e.target.value)} />
          <Select aria-label="Filter by status" value={status} onChange={(e) => reset(setStatus)(e.target.value as ApprovalStatus | '')}>
            <option value="">All statuses</option>
            <option value="APPROVED">Approved</option>
            <option value="PENDING">Pending</option>
            <option value="REJECTED">Rejected</option>
          </Select>
        </div>
        {query.isLoading ? (
          <TableSkeleton />
        ) : query.isError ? (
          <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
        ) : query.data!.data.length === 0 ? (
          <EmptyState title="No hostels match" />
        ) : (
          <>
            <Table aria-label="Hostels">
              <THead>
                <tr>
                  <Th>Hostel</Th>
                  <Th>Contact</Th>
                  <Th className="text-right">Members</Th>
                  <Th className="text-right">Issues</Th>
                  <Th>Registered</Th>
                  <Th>Status</Th>
                </tr>
              </THead>
              <TBody>
                {query.data!.data.map((h) => (
                  <Tr key={h.id}>
                    <Td>
                      <p className="font-medium">{h.name}</p>
                      <p className="text-xs text-muted">{h.city}</p>
                    </Td>
                    <Td className="text-muted">
                      <p>{h.contactEmail}</p>
                      <p className="text-xs">{h.contactPhone}</p>
                    </Td>
                    <Td className="text-right tabular-nums">{h._count.memberships}</Td>
                    <Td className="text-right tabular-nums">{h._count.issues}</Td>
                    <Td className="whitespace-nowrap text-muted">{formatDate(h.createdAt)}</Td>
                    <Td>
                      <ApprovalBadge status={h.status} />
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
            <Pagination meta={query.data!.meta} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
