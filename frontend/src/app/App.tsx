import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { EmptyState } from '@/components/common/common';
import { FullPageLoader, ProtectedRoute, RoleHomeRedirect } from './ProtectedRoute';

const LoginPage = lazy(() => import('@/features/auth/LoginPage'));
const PendingPage = lazy(() => import('@/features/auth/PendingPage'));
const RegisterHostelPage = lazy(() => import('@/features/auth/RegisterPages').then((m) => ({ default: m.RegisterHostelPage })));
const RegisterJoinPage = lazy(() => import('@/features/auth/RegisterPages').then((m) => ({ default: m.RegisterJoinPage })));

const PlatformDashboard = lazy(() => import('@/features/platform-admin/PlatformPages').then((m) => ({ default: m.PlatformDashboard })));
const PlatformHostelsPage = lazy(() => import('@/features/platform-admin/PlatformPages').then((m) => ({ default: m.PlatformHostelsPage })));
const ApprovalsPage = lazy(() => import('@/features/hostel-admin/ApprovalsPage'));
const HostelDashboard = lazy(() => import('@/features/hostel-admin/HostelDashboard'));
const HostelAnalyticsPage = lazy(() => import('@/features/hostel-admin/HostelAnalyticsPage'));
const PeoplePage = lazy(() => import('@/features/hostel-admin/PeopleAndRooms').then((m) => ({ default: m.PeoplePage })));
const RoomsPage = lazy(() => import('@/features/hostel-admin/PeopleAndRooms').then((m) => ({ default: m.RoomsPage })));
const StudentDashboard = lazy(() => import('@/features/student/MemberDashboards').then((m) => ({ default: m.StudentDashboard })));
const AssistantDashboard = lazy(() => import('@/features/student/MemberDashboards').then((m) => ({ default: m.AssistantDashboard })));
const IssuesPage = lazy(() => import('@/features/issues/IssuesPage'));
const IssueDetailPage = lazy(() => import('@/features/issues/IssueDetailPage'));
const CreateIssuePage = lazy(() => import('@/features/issues/CreateIssuePage'));

export default function App() {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[70] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2">
        Skip to content
      </a>
      <Suspense fallback={<FullPageLoader />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/pending" element={<PendingPage />} />
          <Route path="/register/hostel" element={<RegisterHostelPage />} />
          <Route path="/register/join" element={<RegisterJoinPage />} />
          <Route path="/" element={<RoleHomeRedirect />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route path="/issues/:id" element={<IssueDetailPage />} />

              <Route element={<ProtectedRoute roles={['PLATFORM_ADMIN']} />}>
                <Route path="/platform" element={<PlatformDashboard />} />
                <Route path="/platform/approvals" element={<ApprovalsPage scope="platform" />} />
                <Route path="/platform/hostels" element={<PlatformHostelsPage />} />
              </Route>

              <Route element={<ProtectedRoute roles={['HOSTEL_ADMIN']} />}>
                <Route path="/hostel" element={<HostelDashboard />} />
                <Route path="/hostel/issues" element={<IssuesPage />} />
                <Route path="/hostel/approvals" element={<ApprovalsPage scope="hostel" />} />
                <Route path="/hostel/people" element={<PeoplePage />} />
                <Route path="/hostel/rooms" element={<RoomsPage />} />
                <Route path="/hostel/analytics" element={<HostelAnalyticsPage />} />
              </Route>

              <Route element={<ProtectedRoute roles={['ASSISTANT']} />}>
                <Route path="/assistant" element={<AssistantDashboard />} />
                <Route path="/assistant/issues" element={<IssuesPage />} />
              </Route>

              <Route element={<ProtectedRoute roles={['STUDENT']} />}>
                <Route path="/student" element={<StudentDashboard />} />
                <Route path="/student/issues" element={<IssuesPage />} />
                <Route path="/student/new" element={<CreateIssuePage />} />
              </Route>

              <Route path="*" element={<EmptyState title="Page not found" description="The page you are looking for does not exist." />} />
            </Route>
          </Route>
          <Route path="*" element={<RoleHomeRedirect />} />
        </Routes>
      </Suspense>
    </>
  );
}
