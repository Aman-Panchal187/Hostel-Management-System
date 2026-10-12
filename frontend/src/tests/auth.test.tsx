import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/types';
import { ProtectedRoute } from '@/app/ProtectedRoute';
import { renderWithProviders, makeUser } from './utils';

const auth = vi.hoisted(() => ({ user: null as SessionUser | null, loading: false, login: vi.fn(), logout: vi.fn() }));

vi.mock('@/features/auth/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('@/features/auth/AuthContext')>('@/features/auth/AuthContext');
  return { ...actual, useAuth: () => auth };
});
vi.mock('@/services/endpoints', () => ({
  authApi: { registerHostel: vi.fn(), registerStudent: vi.fn(), registerAssistant: vi.fn() },
  publicApi: { hostels: vi.fn().mockResolvedValue([]), rooms: vi.fn().mockResolvedValue([]) },
}));

import LoginPage from '@/features/auth/LoginPage';
import { RegisterHostelPage } from '@/features/auth/RegisterPages';
import { ApiError } from '@/services/api';
import { authApi } from '@/services/endpoints';

beforeEach(() => {
  auth.user = null;
  auth.loading = false;
  auth.login.mockReset();
  vi.mocked(authApi.registerHostel).mockReset();
});

describe('login form', () => {
  it('shows validation errors for empty and malformed input', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.type(screen.getByLabelText('Password'), 'x');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(auth.login).not.toHaveBeenCalled();
  });

  it('submits trimmed credentials', async () => {
    const user = userEvent.setup();
    auth.login.mockResolvedValue(makeUser('STUDENT'));
    renderWithProviders(<LoginPage />);
    await user.type(screen.getByLabelText('Email'), '  student@example.test ');
    await user.type(screen.getByLabelText('Password'), 'Passw0rd!');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(auth.login).toHaveBeenCalledWith('student@example.test', 'Passw0rd!'));
  });

  it('shows the server error message on bad credentials', async () => {
    const user = userEvent.setup();
    auth.login.mockRejectedValue(new ApiError('Invalid email or password', 401, 'INVALID_CREDENTIALS'));
    renderWithProviders(<LoginPage />);
    await user.type(screen.getByLabelText('Email'), 'a@b.co');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
  });

  it('explains rate limiting', async () => {
    const user = userEvent.setup();
    auth.login.mockRejectedValue(new ApiError('Too many requests', 429, 'RATE_LIMITED'));
    renderWithProviders(<LoginPage />);
    await user.type(screen.getByLabelText('Email'), 'a@b.co');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts');
  });
});

describe('hostel registration form', () => {
  it('validates required fields and password rules', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterHostelPage />);
    await user.click(screen.getByRole('button', { name: 'Submit for approval' }));
    expect(await screen.findByText('Enter the hostel name')).toBeInTheDocument();
    expect(screen.getByText('Enter your full name')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Password'), 'alllowercase');
    await user.click(screen.getByRole('button', { name: 'Submit for approval' }));
    expect(await screen.findByText('Include at least one number')).toBeInTheDocument();
    expect(authApi.registerHostel).not.toHaveBeenCalled();
  });

  it('maps a duplicate-email server error onto the email field', async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.registerHostel).mockRejectedValue(new ApiError('exists', 409, 'EMAIL_TAKEN'));
    renderWithProviders(<RegisterHostelPage />);
    await user.type(screen.getByLabelText('Hostel name'), 'Test Hostel');
    await user.type(screen.getByLabelText('Address'), '12 Test Street');
    await user.type(screen.getByLabelText('City'), 'Pune');
    await user.type(screen.getByLabelText('Contact phone'), '+91 98765 43210');
    await user.type(screen.getByLabelText('Contact email'), 'office@test.example');
    await user.type(screen.getByLabelText('Your name'), 'Warden One');
    await user.type(screen.getByLabelText('Login email'), 'warden@test.example');
    await user.type(screen.getByLabelText('Password'), 'Passw0rd!x');
    await user.click(screen.getByRole('button', { name: 'Submit for approval' }));
    expect(await screen.findByText('An account with this email already exists')).toBeInTheDocument();
  });
});

describe('protected routes and role-based redirects', () => {
  const tree = (
    <Routes>
      <Route path="/login" element={<div>login page</div>} />
      <Route path="/hostel" element={<div>hostel home</div>} />
      <Route path="/student" element={<div>student home</div>} />
      <Route element={<ProtectedRoute roles={['HOSTEL_ADMIN']} />}>
        <Route path="/hostel/secret" element={<div>admin area</div>} />
      </Route>
    </Routes>
  );

  it('redirects anonymous visitors to login', () => {
    renderWithProviders(tree, { route: '/hostel/secret' });
    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('shows a loader while the session is restored', () => {
    auth.loading = true;
    renderWithProviders(tree, { route: '/hostel/secret' });
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('sends users of the wrong role to their own home', () => {
    auth.user = makeUser('STUDENT');
    renderWithProviders(tree, { route: '/hostel/secret' });
    expect(screen.getByText('student home')).toBeInTheDocument();
    expect(screen.queryByText('admin area')).not.toBeInTheDocument();
  });

  it('lets the permitted role through', () => {
    auth.user = makeUser('HOSTEL_ADMIN');
    renderWithProviders(tree, { route: '/hostel/secret' });
    expect(screen.getByText('admin area')).toBeInTheDocument();
  });
});
