import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AssistantStat, DayPoint, NamedValue, PlatformHostelStat } from '@/types';
import { prettyLabel } from '@/utils/format';

/** Dark-surface categorical steps from the reference palette, assigned in fixed order. */
export const SERIES = ['#3987e5', '#199e70', '#d95926', '#c98500', '#d55181', '#9085e9'] as const;
/** Status colors are semantic and always paired with a text label in legends. */
export const STATUS_COLOR = { YET_TO_START: '#F59E0B', IN_PROGRESS: '#3B82F6', DONE: '#22C55E' } as const;

const AXIS = { stroke: '#94A3B8', fontSize: 12, tickLine: false, axisLine: false } as const;
const GRID = '#334155';
const tooltipStyle = {
  contentStyle: { background: '#111827', border: '1px solid #334155', borderRadius: 8, color: '#F8FAFC', fontSize: 12 },
  labelStyle: { color: '#94A3B8' },
  itemStyle: { color: '#F8FAFC' },
  cursor: { fill: 'rgb(148 163 184 / 0.08)' },
} as const;
const legendStyle = { fontSize: 12, color: '#94A3B8' } as const;

const shortDay = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

export function StatusDonut({ data }: Readonly<{ data: NamedValue[] }>) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="relative h-64" role="img" aria-label={`Issue status distribution, ${total} issues`}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie isAnimationActive={false} data={data} dataKey="value" nameKey="name" innerRadius={62} outerRadius={90} paddingAngle={2} stroke="#111827" strokeWidth={2}>
            {data.map((d) => (
              <Cell key={d.name} fill={STATUS_COLOR[d.name as keyof typeof STATUS_COLOR] ?? '#94A3B8'} />
            ))}
          </Pie>
          <Tooltip {...tooltipStyle} formatter={(v, n) => [v as number, prettyLabel(String(n))]} />
          <Legend wrapperStyle={legendStyle} formatter={(v) => prettyLabel(String(v))} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-x-0 top-[88px] text-center">
        <div className="text-2xl font-semibold">{total}</div>
        <div className="text-xs text-muted">issues</div>
      </div>
    </div>
  );
}

export function CategoryBars({ data, label }: Readonly<{ data: NamedValue[]; label: string }>) {
  const rows = data.map((d) => ({ ...d, name: prettyLabel(d.name) }));
  return (
    <div className="h-64" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }}>
          <CartesianGrid stroke={GRID} strokeOpacity={0.5} horizontal={false} />
          <XAxis type="number" allowDecimals={false} {...AXIS} />
          <YAxis type="category" dataKey="name" width={96} {...AXIS} />
          <Tooltip {...tooltipStyle} />
          <Bar isAnimationActive={false} dataKey="value" name="Issues" fill={SERIES[0]} radius={[0, 4, 4, 0]} barSize={14} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrendChart({ created, resolved }: Readonly<{ created: DayPoint[]; resolved?: DayPoint[] }>) {
  const rows = created.map((point, i) => ({ day: point.day, created: point.count, resolved: resolved?.[i]?.count ?? 0 }));
  return (
    <div className="h-64" role="img" aria-label="Issues created and resolved over time">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ left: -16, right: 8, top: 8 }}>
          <defs>
            <linearGradient id="fillCreated" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.35} />
              <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} strokeOpacity={0.5} vertical={false} />
          <XAxis dataKey="day" tickFormatter={shortDay} minTickGap={32} {...AXIS} />
          <YAxis allowDecimals={false} {...AXIS} />
          <Tooltip {...tooltipStyle} cursor={{ stroke: '#94A3B8', strokeDasharray: '3 3' }} />
          <Legend wrapperStyle={legendStyle} />
          <Area isAnimationActive={false} type="monotone" dataKey="created" name="Created" stroke={SERIES[0]} strokeWidth={2} fill="url(#fillCreated)" dot={false} activeDot={{ r: 4, stroke: '#111827', strokeWidth: 2 }} />
          {resolved && <Area isAnimationActive={false} type="monotone" dataKey="resolved" name="Resolved" stroke={SERIES[1]} strokeWidth={2} fill="none" dot={false} activeDot={{ r: 4, stroke: '#111827', strokeWidth: 2 }} />}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AssistantChart({ data }: Readonly<{ data: AssistantStat[] }>) {
  return (
    <div className="h-64" role="img" aria-label="Assigned and completed issues per assistant">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: -16, right: 8, top: 8 }}>
          <CartesianGrid stroke={GRID} strokeOpacity={0.5} vertical={false} />
          <XAxis dataKey="name" tickFormatter={(v: string) => v.split(' ')[0] ?? v} {...AXIS} />
          <YAxis allowDecimals={false} {...AXIS} />
          <Tooltip {...tooltipStyle} />
          <Legend wrapperStyle={legendStyle} />
          <Bar isAnimationActive={false} dataKey="assigned" name="Assigned" fill={SERIES[0]} radius={[4, 4, 0, 0]} barSize={14} />
          <Bar isAnimationActive={false} dataKey="completed" name="Completed" fill={SERIES[1]} radius={[4, 4, 0, 0]} barSize={14} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HostelComparisonChart({ data }: Readonly<{ data: PlatformHostelStat[] }>) {
  return (
    <div className="h-72" role="img" aria-label="Issues by status for each hostel">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: -16, right: 8, top: 8 }}>
          <CartesianGrid stroke={GRID} strokeOpacity={0.5} vertical={false} />
          <XAxis dataKey="name" tickFormatter={(v: string) => v.split(' ').slice(0, 2).join(' ')} interval={0} {...AXIS} />
          <YAxis allowDecimals={false} {...AXIS} />
          <Tooltip {...tooltipStyle} />
          <Legend wrapperStyle={legendStyle} />
          <Bar isAnimationActive={false} dataKey="yetToStart" name="Yet to start" stackId="s" fill={STATUS_COLOR.YET_TO_START} stroke="#111827" strokeWidth={2} />
          <Bar isAnimationActive={false} dataKey="inProgress" name="In progress" stackId="s" fill={STATUS_COLOR.IN_PROGRESS} stroke="#111827" strokeWidth={2} />
          <Bar isAnimationActive={false} dataKey="done" name="Done" stackId="s" fill={STATUS_COLOR.DONE} stroke="#111827" strokeWidth={2} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
