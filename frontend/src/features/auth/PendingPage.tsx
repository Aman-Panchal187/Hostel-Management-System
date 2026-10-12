import { Link, useLocation } from 'react-router-dom';
import { Clock, XCircle } from 'lucide-react';
import { AuthLayout } from './AuthLayout';

interface PendingState {
  status?: 'PENDING' | 'REJECTED';
  email?: string;
  message?: string;
  kind?: 'hostel' | 'student' | 'assistant';
}

const WHO: Record<NonNullable<PendingState['kind']>, string> = {
  hostel: 'the platform administrator',
  student: 'your hostel administrator',
  assistant: 'your hostel administrator',
};

export default function PendingPage() {
  const state = (useLocation().state as PendingState | null) ?? {};
  const rejected = state.status === 'REJECTED';
  const approver = state.kind ? WHO[state.kind] : 'an administrator';

  return (
    <AuthLayout title={rejected ? 'Registration rejected' : 'Awaiting approval'} subtitle={rejected ? 'Your registration was not approved' : 'Your registration has been received'}>
      <div data-testid={rejected ? 'rejected-state' : 'pending-state'} className="glass rounded-xl p-6 text-center">
        <span className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${rejected ? 'bg-danger/15 text-danger' : 'bg-warning/15 text-warning'}`}>
          {rejected ? <XCircle className="h-7 w-7" aria-hidden /> : <Clock className="h-7 w-7" aria-hidden />}
        </span>
        <p className="font-medium">{rejected ? 'Access has not been granted' : 'Approval pending'}</p>
        <p className="mt-2 text-sm text-muted">
          {rejected
            ? 'Please contact your hostel administrator or register again with correct details.'
            : (state.message ?? `You can sign in once ${approver} approves your request.`)}
        </p>
        {state.email && <p className="mt-3 text-xs text-muted">Account: {state.email}</p>}
        <Link to="/login" className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-lg border border-border bg-card text-sm font-medium transition-colors hover:bg-card/70">Back to sign in</Link>
      </div>
    </AuthLayout>
  );
}
