/** Pure helpers for analytics calculations (unit-tested). */

export const percentage = (part: number, whole: number): number =>
  whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10;

export const roundHours = (value: number | null | undefined): number | null =>
  value === null || value === undefined ? null : Math.round(value * 10) / 10;

export interface StatusCounts {
  YET_TO_START: number;
  IN_PROGRESS: number;
  DONE: number;
  total: number;
}

export function toStatusCounts(rows: { status: string; count: number }[]): StatusCounts {
  const counts: StatusCounts = { YET_TO_START: 0, IN_PROGRESS: 0, DONE: 0, total: 0 };
  for (const row of rows) {
    if (row.status === 'YET_TO_START' || row.status === 'IN_PROGRESS' || row.status === 'DONE') {
      counts[row.status] = row.count;
      counts.total += row.count;
    }
  }
  return counts;
}

/** Fills missing days so charts show a continuous series. */
export function fillDailySeries(rows: { day: string; count: number }[], from: Date, to: Date): { day: string; count: number }[] {
  const byDay = new Map(rows.map((row) => [row.day, row.count]));
  const series: { day: string; count: number }[] = [];
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  while (cursor.getTime() <= end && series.length < 400) {
    const day = cursor.toISOString().slice(0, 10);
    series.push({ day, count: byDay.get(day) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return series;
}
