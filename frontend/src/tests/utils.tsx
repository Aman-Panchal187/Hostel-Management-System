import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/ui/toast';
import type { Role, SessionUser } from '@/types';

export const makeUser = (role: Role, overrides: Partial<SessionUser> = {}): SessionUser => ({
  id: `${role}-1`,
  name: 'Test Person',
  email: 'test@example.test',
  role,
  hostel: role === 'PLATFORM_ADMIN' ? null : { id: 'h1', name: 'Test Hostel' },
  roomNumber: role === 'STUDENT' ? '101' : null,
  ...overrides,
});

export function renderWithProviders(ui: ReactElement, { route = '/' }: { route?: string } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}
