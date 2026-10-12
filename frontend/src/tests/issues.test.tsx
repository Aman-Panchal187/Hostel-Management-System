import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IssueDetail, IssueListItem, SessionUser } from '@/types';
import { makeUser, renderWithProviders } from './utils';

const auth = vi.hoisted(() => ({ user: null as SessionUser | null, loading: false, login: vi.fn(), logout: vi.fn() }));
vi.mock('@/features/auth/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('@/features/auth/AuthContext')>('@/features/auth/AuthContext');
  return { ...actual, useAuth: () => auth };
});
vi.mock('@/services/endpoints', () => ({
  issuesApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), assign: vi.fn(), changeStatus: vi.fn() },
  usersApi: { list: vi.fn() },
  analyticsApi: { me: vi.fn() },
}));

import { StudentDashboard } from '@/features/student/MemberDashboards';
import CreateIssuePage from '@/features/issues/CreateIssuePage';
import IssueDetailPage from '@/features/issues/IssueDetailPage';
import { IssuesTable } from '@/features/issues/IssuesPage';
import { NAV } from '@/components/layout/AppShell';
import { analyticsApi, issuesApi, usersApi } from '@/services/endpoints';

const listItem = (overrides: Partial<IssueListItem> = {}): IssueListItem => ({
  id: 'i1',
  title: 'Broken fan',
  category: 'ELECTRICAL',
  priority: 'HIGH',
  status: 'YET_TO_START',
  createdAt: '2026-10-01T10:00:00Z',
  assignedAt: null,
  startedAt: null,
  completedAt: null,
  reporter: { id: 's1', name: 'Sam Student' },
  assignee: null,
  room: { number: '101' },
  ...overrides,
});

const detail = (overrides: Partial<IssueDetail> = {}): IssueDetail => ({
  ...listItem(),
  description: 'The fan stopped working yesterday.',
  resolutionNotes: null,
  updatedAt: '2026-10-01T10:00:00Z',
  attachments: [],
  history: [{ id: 'h1', fromStatus: null, toStatus: 'YET_TO_START', note: 'Issue created', createdAt: '2026-10-01T10:00:00Z', changedBy: { id: 's1', name: 'Sam Student' } }],
  ...overrides,
});

const page = (data: IssueListItem[]) => ({ data, meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 } });

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = makeUser('STUDENT');
  vi.mocked(usersApi.list).mockResolvedValue({ data: [{ id: 'a1', name: 'Asha Assistant', email: 'a@x.test', role: 'ASSISTANT', status: 'APPROVED', roomNumber: null, createdAt: '' }], meta: { page: 1, pageSize: 100, total: 1, totalPages: 1 } });
});

describe('issue list states', () => {
  it('shows a skeleton while loading', () => {
    vi.mocked(issuesApi.list).mockReturnValue(new Promise(() => undefined));
    renderWithProviders(<IssuesTable filters={{}} />);
    expect(screen.getByLabelText('Loading')).toHaveAttribute('aria-busy', 'true');
  });

  it('shows an empty state', async () => {
    vi.mocked(issuesApi.list).mockResolvedValue(page([]));
    renderWithProviders(<IssuesTable filters={{}} />);
    expect(await screen.findByText('No issues found')).toBeInTheDocument();
  });

  it('shows an error with a retry button', async () => {
    vi.mocked(issuesApi.list).mockRejectedValueOnce(new Error('Server exploded')).mockResolvedValue(page([listItem()]));
    const user = userEvent.setup();
    renderWithProviders(<IssuesTable filters={{}} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Server exploded');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Broken fan')).toBeInTheDocument();
  });

  it('renders rows with status and priority badges', async () => {
    vi.mocked(issuesApi.list).mockResolvedValue(page([listItem()]));
    renderWithProviders(<IssuesTable filters={{}} />);
    const row = (await screen.findByText('Broken fan')).closest('tr')!;
    expect(within(row).getByText('Yet to start')).toBeInTheDocument();
    expect(within(row).getByText('High')).toBeInTheDocument();
    expect(within(row).getByText('Unassigned')).toBeInTheDocument();
  });
});

describe('issue assignment controls', () => {
  it('assigns an issue to the chosen assistant', async () => {
    auth.user = makeUser('HOSTEL_ADMIN');
    vi.mocked(issuesApi.list).mockResolvedValue(page([listItem()]));
    vi.mocked(issuesApi.assign).mockResolvedValue(detail());
    const user = userEvent.setup();
    renderWithProviders(<IssuesTable filters={{}} showAssign />);
    const select = await screen.findByLabelText('Assign issue');
    await screen.findByRole('option', { name: 'Asha Assistant' });
    await user.selectOptions(select, 'a1');
    await waitFor(() => expect(issuesApi.assign).toHaveBeenCalledWith('i1', 'a1'));
    expect(await screen.findByText('Issue assigned')).toBeInTheDocument();
  });
});

describe('create issue form', () => {
  it('validates before submitting', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreateIssuePage />);
    await user.click(screen.getByRole('button', { name: 'Submit issue' }));
    expect(await screen.findByText('Title must be at least 3 characters')).toBeInTheDocument();
    expect(screen.getByText('Choose a category')).toBeInTheDocument();
    expect(issuesApi.create).not.toHaveBeenCalled();
  });

  it('rejects non-https media links and submits a valid issue', async () => {
    vi.mocked(issuesApi.create).mockResolvedValue(detail());
    vi.mocked(issuesApi.get).mockResolvedValue(detail());
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/" element={<CreateIssuePage />} />
        <Route path="/issues/:id" element={<div>created</div>} />
      </Routes>,
    );
    await user.type(screen.getByLabelText('Title'), 'Leaking tap');
    await user.selectOptions(screen.getByLabelText('Category'), 'PLUMBING');
    await user.type(screen.getByLabelText('Description'), 'The tap in the bathroom leaks constantly.');
    await user.type(screen.getByLabelText('Media URL'), 'http://insecure.example/a.png');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Enter a valid https:// link')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Media URL'));
    await user.type(screen.getByLabelText('Media URL'), 'https://picsum.photos/seed/a/600/400');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.click(screen.getByRole('button', { name: 'Submit issue' }));
    await waitFor(() =>
      expect(issuesApi.create).toHaveBeenCalledWith({
        title: 'Leaking tap',
        category: 'PLUMBING',
        priority: 'MEDIUM',
        description: 'The tap in the bathroom leaks constantly.',
        attachments: [{ url: 'https://picsum.photos/seed/a/600/400', mediaType: 'IMAGE' }],
      }),
    );
    expect(await screen.findByText('created')).toBeInTheDocument();
  });
});

describe('assistant status update UI', () => {
  const renderDetail = () =>
    renderWithProviders(
      <Routes>
        <Route path="/issues/:id" element={<IssueDetailPage />} />
      </Routes>,
      { route: '/issues/i1' },
    );

  beforeEach(() => {
    auth.user = makeUser('ASSISTANT');
  });

  it('starts work after confirmation', async () => {
    vi.mocked(issuesApi.get).mockResolvedValue(detail({ assignee: { id: 'ASSISTANT-1', name: 'Test Person' } }));
    vi.mocked(issuesApi.changeStatus).mockResolvedValue(detail({ status: 'IN_PROGRESS' }));
    const user = userEvent.setup();
    renderDetail();
    await user.click(await screen.findByRole('button', { name: 'Start work' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Start work' }));
    await waitFor(() => expect(issuesApi.changeStatus).toHaveBeenCalledWith('i1', { status: 'IN_PROGRESS' }));
  });

  it('requires notes and evidence before completing', async () => {
    vi.mocked(issuesApi.get).mockResolvedValue(detail({ status: 'IN_PROGRESS' }));
    vi.mocked(issuesApi.changeStatus).mockResolvedValue(detail({ status: 'DONE' }));
    const user = userEvent.setup();
    renderDetail();
    await user.click(await screen.findByRole('button', { name: 'Mark as done' }));
    expect(await screen.findByText('Describe what you did to resolve the issue.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Resolution notes'), 'Replaced the capacitor');
    await user.click(screen.getByRole('button', { name: 'Mark as done' }));
    expect(await screen.findByText('Add at least one photo or video link as proof.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Evidence URL'), 'https://picsum.photos/seed/done/600/400');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.click(screen.getByRole('button', { name: 'Mark as done' }));
    await waitFor(() =>
      expect(issuesApi.changeStatus).toHaveBeenCalledWith('i1', {
        status: 'DONE',
        resolutionNotes: 'Replaced the capacitor',
        attachments: [{ url: 'https://picsum.photos/seed/done/600/400', mediaType: 'IMAGE' }],
      }),
    );
  });

  it('shows no work controls on completed issues and renders the timeline', async () => {
    vi.mocked(issuesApi.get).mockResolvedValue(
      detail({
        status: 'DONE',
        resolutionNotes: 'All fixed',
        history: [
          { id: 'a', fromStatus: null, toStatus: 'YET_TO_START', note: null, createdAt: '2026-10-01T10:00:00Z', changedBy: { id: 's', name: 'Sam' } },
          { id: 'b', fromStatus: 'YET_TO_START', toStatus: 'IN_PROGRESS', note: null, createdAt: '2026-10-02T10:00:00Z', changedBy: { id: 'a', name: 'Asha' } },
          { id: 'c', fromStatus: 'IN_PROGRESS', toStatus: 'DONE', note: 'All fixed', createdAt: '2026-10-03T10:00:00Z', changedBy: { id: 'a', name: 'Asha' } },
        ],
      }),
    );
    renderDetail();
    expect(await screen.findByTestId('resolution-notes')).toHaveTextContent('All fixed');
    expect(screen.queryByRole('button', { name: 'Mark as done' })).not.toBeInTheDocument();
    expect(screen.getAllByTestId('history-entry')).toHaveLength(3);
  });

  it('shows a not-found state for inaccessible issues', async () => {
    const { ApiError } = await import('@/services/api');
    vi.mocked(issuesApi.get).mockRejectedValue(new ApiError('Issue not found', 404, 'NOT_FOUND'));
    renderDetail();
    expect(await screen.findByText('Issue not found')).toBeInTheDocument();
  });
});

describe('dashboards and navigation', () => {
  it('student dashboard shows loading skeletons then backend numbers', async () => {
    vi.mocked(analyticsApi.me).mockResolvedValue({ total: 7, open: 4, inProgress: 2, done: 3, yetToStart: 2 });
    vi.mocked(issuesApi.list).mockResolvedValue(page([]));
    renderWithProviders(<StudentDashboard />);
    expect(await screen.findByTestId('kpi-total-value')).toHaveTextContent('7');
    expect(screen.getByTestId('kpi-open-value')).toHaveTextContent('4');
    expect(screen.getByTestId('kpi-done-value')).toHaveTextContent('3');
  });

  it('student dashboard shows an error state when the API fails', async () => {
    vi.mocked(analyticsApi.me).mockRejectedValue(new Error('boom'));
    vi.mocked(issuesApi.list).mockResolvedValue(page([]));
    renderWithProviders(<StudentDashboard />);
    expect((await screen.findAllByRole('alert'))[0]).toHaveTextContent('boom');
  });

  it('each role only gets its own navigation entries', () => {
    const paths = (role: keyof typeof NAV) => NAV[role].map((n) => n.to);
    expect(paths('STUDENT')).toEqual(['/student', '/student/issues', '/student/new']);
    expect(paths('HOSTEL_ADMIN')).toContain('/hostel/approvals');
    expect(paths('HOSTEL_ADMIN')).not.toContain('/platform');
    expect(paths('ASSISTANT').every((p) => p.startsWith('/assistant'))).toBe(true);
    expect(paths('PLATFORM_ADMIN').every((p) => p.startsWith('/platform'))).toBe(true);
  });
});
