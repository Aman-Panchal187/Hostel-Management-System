export type Role = 'PLATFORM_ADMIN' | 'HOSTEL_ADMIN' | 'ASSISTANT' | 'STUDENT';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type ApprovalType = 'HOSTEL_REGISTRATION' | 'ASSISTANT_REGISTRATION' | 'STUDENT_REGISTRATION';
export type IssueStatus = 'YET_TO_START' | 'IN_PROGRESS' | 'DONE';
export type IssuePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type IssueCategory = 'ELECTRICAL' | 'PLUMBING' | 'FURNITURE' | 'CLEANING' | 'INTERNET' | 'WATER_SUPPLY' | 'OTHER';
export type MediaType = 'IMAGE' | 'VIDEO';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  hostel: { id: string; name: string } | null;
  roomNumber: string | null;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paged<T> {
  data: T[];
  meta: PageMeta;
}

export interface IssueListItem {
  id: string;
  title: string;
  category: IssueCategory;
  priority: IssuePriority;
  status: IssueStatus;
  createdAt: string;
  assignedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  reporter: { id: string; name: string };
  assignee: { id: string; name: string } | null;
  room: { number: string } | null;
}

export interface IssueAttachment {
  id: string;
  kind: 'REFERENCE' | 'RESOLUTION';
  mediaType: MediaType;
  url: string;
  createdAt: string;
  uploadedBy: { id: string; name: string };
}

export interface IssueHistoryEntry {
  id: string;
  fromStatus: IssueStatus | null;
  toStatus: IssueStatus;
  note: string | null;
  createdAt: string;
  changedBy: { id: string; name: string };
}

export interface IssueDetail extends IssueListItem {
  description: string;
  resolutionNotes: string | null;
  updatedAt: string;
  attachments: IssueAttachment[];
  history: IssueHistoryEntry[];
}

export interface IssueFilters {
  page?: number;
  pageSize?: number;
  status?: IssueStatus | '';
  priority?: IssuePriority | '';
  category?: IssueCategory | '';
  assigneeId?: string;
  unassigned?: boolean;
  search?: string;
  sortBy?: 'createdAt' | 'updatedAt' | 'priority' | 'status';
  sortDir?: 'asc' | 'desc';
}

export interface ApprovalItem {
  id: string;
  type: ApprovalType;
  status: ApprovalStatus;
  reason: string | null;
  createdAt: string;
  decidedAt: string | null;
  hostel: { id: string; name: string; city: string; contactEmail: string; contactPhone: string };
  user: { id: string; name: string; email: string; role: Role; roomNumber: string | null };
}

export interface HostelRow {
  id: string;
  name: string;
  city: string;
  address: string;
  contactEmail: string;
  contactPhone: string;
  status: ApprovalStatus;
  isDemo: boolean;
  createdAt: string;
  _count: { issues: number; memberships: number };
}

export interface RoomRow {
  id: string;
  number: string;
  floor: number;
  capacity: number;
  occupants: number;
}

export interface MemberRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: ApprovalStatus;
  roomNumber: string | null;
  createdAt: string;
}

export interface NamedValue {
  name: string;
  value: number;
}
export interface DayPoint {
  day: string;
  count: number;
}

export interface AssistantStat {
  id: string;
  name: string;
  assigned: number;
  inProgress: number;
  completed: number;
  completionRate: number;
  avgResolutionHours: number | null;
}

export interface HostelAnalytics {
  range: { from: string; to: string };
  kpis: {
    total: number;
    yetToStart: number;
    inProgress: number;
    done: number;
    completionRate: number;
    avgResolutionHours: number | null;
    pendingApprovals: number;
  };
  byStatus: NamedValue[];
  byCategory: NamedValue[];
  byPriority: NamedValue[];
  createdOverTime: DayPoint[];
  resolvedOverTime: DayPoint[];
  assistants: AssistantStat[];
}

export interface PlatformHostelStat {
  id: string;
  name: string;
  city: string;
  total: number;
  yetToStart: number;
  inProgress: number;
  done: number;
  completionRate: number;
  avgResolutionHours: number | null;
}

export interface PlatformAnalytics {
  range: { from: string; to: string };
  kpis: {
    totalHostels: number;
    approvedHostels: number;
    pendingHostels: number;
    rejectedHostels: number;
    students: number;
    assistants: number;
    totalIssues: number;
    completionRate: number;
  };
  byStatus: NamedValue[];
  createdOverTime: DayPoint[];
  hostels: PlatformHostelStat[];
}

export interface PersonalSummary {
  total: number;
  yetToStart: number;
  inProgress: number;
  done: number;
  open: number;
}

export interface PublicHostel {
  id: string;
  name: string;
  city: string;
}

export interface AuditRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
  actor: { id: string; name: string; role: Role } | null;
  hostel: { id: string; name: string } | null;
}

export interface MediaInput {
  url: string;
  mediaType: MediaType;
}
