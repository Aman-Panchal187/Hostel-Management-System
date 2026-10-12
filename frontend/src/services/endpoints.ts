import { http, setAccessToken } from './api';
import type { SessionResponse } from './api';
import type {
  ApprovalItem,
  ApprovalStatus,
  ApprovalType,
  AuditRow,
  HostelAnalytics,
  HostelRow,
  IssueCategory,
  IssueDetail,
  IssueFilters,
  IssueListItem,
  IssuePriority,
  IssueStatus,
  MediaInput,
  MemberRow,
  Paged,
  PersonalSummary,
  PlatformAnalytics,
  PublicHostel,
  RoomRow,
} from '@/types';

const csrf = { headers: { 'X-Requested-With': 'XMLHttpRequest' } };
const clean = <T extends object>(params: T) =>
  Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null));

export const authApi = {
  async login(email: string, password: string) {
    const { data } = await http.post<SessionResponse>('/api/auth/login', { email, password });
    setAccessToken(data.accessToken);
    return data.user;
  },
  async logout() {
    try {
      await http.post('/api/auth/logout', undefined, { ...csrf, _skipRefresh: true });
    } finally {
      setAccessToken(null);
    }
  },
  registerHostel: (body: Record<string, string>) => http.post<{ message: string }>('/api/auth/register/hostel', body).then((r) => r.data),
  registerStudent: (body: Record<string, string>) => http.post<{ message: string }>('/api/auth/register/student', body).then((r) => r.data),
  registerAssistant: (body: Record<string, string>) => http.post<{ message: string }>('/api/auth/register/assistant', body).then((r) => r.data),
};

export const publicApi = {
  hostels: (search?: string) => http.get<{ data: PublicHostel[] }>('/api/public/hostels', { params: clean({ search }) }).then((r) => r.data.data),
  rooms: (hostelId: string) => http.get<{ data: { id: string; number: string; floor: number }[] }>(`/api/public/hostels/${hostelId}/rooms`).then((r) => r.data.data),
};

export const issuesApi = {
  list: (filters: IssueFilters) => http.get<Paged<IssueListItem>>('/api/issues', { params: clean(filters) }).then((r) => r.data),
  get: (id: string) => http.get<IssueDetail>(`/api/issues/${id}`).then((r) => r.data),
  create: (body: { title: string; description: string; category: IssueCategory; priority: IssuePriority; roomId?: string; attachments: MediaInput[] }) =>
    http.post<IssueDetail>('/api/issues', body).then((r) => r.data),
  assign: (id: string, assigneeId: string) => http.post<IssueDetail>(`/api/issues/${id}/assign`, { assigneeId }).then((r) => r.data),
  changeStatus: (id: string, body: { status: Exclude<IssueStatus, 'YET_TO_START'>; resolutionNotes?: string; attachments?: MediaInput[] }) =>
    http.post<IssueDetail>(`/api/issues/${id}/status`, body).then((r) => r.data),
  addAttachment: (id: string, body: MediaInput & { kind: 'REFERENCE' | 'RESOLUTION' }) => http.post(`/api/issues/${id}/attachments`, body).then((r) => r.data),
};

export const approvalsApi = {
  list: (params: { page?: number; pageSize?: number; status?: ApprovalStatus; type?: ApprovalType }) =>
    http.get<Paged<ApprovalItem>>('/api/approvals', { params: clean(params) }).then((r) => r.data),
  decide: (id: string, decision: 'APPROVED' | 'REJECTED', reason?: string) =>
    http.post(`/api/approvals/${id}/decision`, { decision, reason: reason || undefined }).then((r) => r.data),
};

export const hostelsApi = {
  list: (params: { page?: number; pageSize?: number; status?: ApprovalStatus; search?: string }) =>
    http.get<Paged<HostelRow>>('/api/hostels', { params: clean(params) }).then((r) => r.data),
};

export const roomsApi = {
  list: () => http.get<{ data: RoomRow[] }>('/api/rooms').then((r) => r.data.data),
  create: (body: { number: string; floor: number; capacity: number }) => http.post('/api/rooms', body).then((r) => r.data),
  update: (id: string, body: Partial<{ number: string; floor: number; capacity: number }>) => http.patch(`/api/rooms/${id}`, body).then((r) => r.data),
  remove: (id: string) => http.delete(`/api/rooms/${id}`).then(() => undefined),
};

export const usersApi = {
  list: (params: { page?: number; pageSize?: number; role?: 'ASSISTANT' | 'STUDENT'; status?: ApprovalStatus; search?: string }) =>
    http.get<Paged<MemberRow>>('/api/users', { params: clean(params) }).then((r) => r.data),
};

export const auditApi = {
  list: (params: { page?: number; pageSize?: number }) => http.get<Paged<AuditRow>>('/api/audit', { params: clean(params) }).then((r) => r.data),
};

export interface HostelAnalyticsParams {
  from?: string;
  to?: string;
  status?: IssueStatus | '';
  category?: IssueCategory | '';
  assigneeId?: string;
}
export interface PlatformAnalyticsParams {
  from?: string;
  to?: string;
  hostelId?: string;
  status?: IssueStatus | '';
}

export const analyticsApi = {
  hostel: (params: HostelAnalyticsParams) => http.get<HostelAnalytics>('/api/analytics/hostel', { params: clean(params) }).then((r) => r.data),
  platform: (params: PlatformAnalyticsParams) => http.get<PlatformAnalytics>('/api/analytics/platform', { params: clean(params) }).then((r) => r.data),
  me: () => http.get<PersonalSummary>('/api/analytics/me').then((r) => r.data),
};
