import type { ApprovalType, IssueCategory, IssuePriority, IssueStatus, Role } from '@/types';

export const STATUS_LABEL: Record<IssueStatus, string> = {
  YET_TO_START: 'Yet to start',
  IN_PROGRESS: 'In progress',
  DONE: 'Done',
};

export const PRIORITY_LABEL: Record<IssuePriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};

export const CATEGORY_LABEL: Record<IssueCategory, string> = {
  ELECTRICAL: 'Electrical',
  PLUMBING: 'Plumbing',
  FURNITURE: 'Furniture',
  CLEANING: 'Cleaning',
  INTERNET: 'Internet',
  WATER_SUPPLY: 'Water Supply',
  OTHER: 'Other',
};

export const ROLE_LABEL: Record<Role, string> = {
  PLATFORM_ADMIN: 'Platform Admin',
  HOSTEL_ADMIN: 'Hostel Admin',
  ASSISTANT: 'Assistant',
  STUDENT: 'Student',
};

export const APPROVAL_TYPE_LABEL: Record<ApprovalType, string> = {
  HOSTEL_REGISTRATION: 'Hostel',
  ASSISTANT_REGISTRATION: 'Assistant',
  STUDENT_REGISTRATION: 'Student',
};

export const ISSUE_CATEGORIES = Object.keys(CATEGORY_LABEL) as IssueCategory[];
export const ISSUE_PRIORITIES = Object.keys(PRIORITY_LABEL) as IssuePriority[];
export const ISSUE_STATUSES = Object.keys(STATUS_LABEL) as IssueStatus[];

const labelFor = (value: string) =>
  (STATUS_LABEL as Record<string, string>)[value] ??
  (CATEGORY_LABEL as Record<string, string>)[value] ??
  (PRIORITY_LABEL as Record<string, string>)[value] ??
  value;
export const prettyLabel = labelFor;

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export function formatHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return '—';
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} d`;
}

export function toDateInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function rangeToIso(from: string, to: string): { from?: string; to?: string } {
  return {
    from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
    to: to ? new Date(`${to}T23:59:59.999`).toISOString() : undefined,
  };
}

export function daysAgoInput(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toDateInput(d);
}
