import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { ApiError } from '@/services/api';
import { AuthLayout, AuthLink } from './AuthLayout';
import { HOME_BY_ROLE, useAuth } from './AuthContext';

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').pipe(z.email('Enter a valid email address')),
  password: z.string().min(1, 'Password is required'),
});
type LoginValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  if (user) return <Navigate to={HOME_BY_ROLE[user.role]} replace />;
  const from = (location.state as { from?: string } | null)?.from;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const next = await login(values.email, values.password);
      navigate(from && from !== '/login' ? from : HOME_BY_ROLE[next.role], { replace: true });
    } catch (err) {
      const apiError = err as ApiError;
      if (apiError.code === 'ACCOUNT_PENDING' || apiError.code === 'ACCOUNT_REJECTED') {
        navigate('/pending', { state: { status: apiError.code === 'ACCOUNT_PENDING' ? 'PENDING' : 'REJECTED', email: values.email } });
        return;
      }
      setFormError(apiError.status === 429 ? 'Too many attempts. Please wait a minute and try again.' : apiError.message);
    }
  });

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your hostel workspace"
      footer={
        <div className="space-y-1">
          <p>
            New hostel? <AuthLink to="/register/hostel">Register your hostel</AuthLink>
          </p>
          <p>
            Student or assistant? <AuthLink to="/register/join">Join a hostel</AuthLink>
          </p>
        </div>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && (
          <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {formError}
          </div>
        )}
        <Field label="Email" error={errors.email?.message}>
          <Input type="email" autoComplete="username" placeholder="you@example.com" {...register('email')} />
        </Field>
        <Field label="Password" error={errors.password?.message}>
          <Input type="password" autoComplete="current-password" placeholder="••••••••" {...register('password')} />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
