import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Controller, useForm, useWatch } from 'react-hook-form';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { ApiError } from '@/services/api';
import { authApi, publicApi } from '@/services/endpoints';
import { cn } from '@/utils/cn';
import { AuthLayout, AuthLink } from './AuthLayout';
import { HostelPicker } from './HostelPicker';

const email = z.string().trim().min(1, 'Email is required').pipe(z.email('Enter a valid email address'));
const name = z.string().trim().min(2, 'Enter your full name').max(100);
export const passwordRule = z
  .string()
  .min(8, 'At least 8 characters')
  .max(72, 'At most 72 characters')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/\d/, 'Include at least one number');

export const hostelSchema = z.object({
  hostelName: z.string().trim().min(2, 'Enter the hostel name').max(120),
  address: z.string().trim().min(5, 'Enter the full address').max(300),
  city: z.string().trim().min(2, 'Enter the city').max(80),
  contactPhone: z.string().trim().regex(/^[+\d][\d\s-]{6,18}$/, 'Enter a valid phone number'),
  contactEmail: email,
  name,
  email,
  password: passwordRule,
});
type HostelValues = z.infer<typeof hostelSchema>;

const memberBase = z.object({
  hostel: z.object({ id: z.string(), name: z.string(), city: z.string() }, { error: 'Select your hostel from the list' }),
  name,
  email,
  password: passwordRule,
});
export const studentSchema = memberBase.extend({ roomNumber: z.string().min(1, 'Select your room') });
export const assistantSchema = memberBase;

function applyServerError<T extends FieldValues>(err: unknown, setError: UseFormSetError<T>, setForm: (m: string) => void) {
  const apiError = err as ApiError;
  if (apiError.code === 'EMAIL_TAKEN') setError('email' as Path<T>, { message: 'An account with this email already exists' });
  else if (apiError.code === 'VALIDATION_ERROR' && apiError.details?.length) {
    for (const d of apiError.details) setError(d.path as Path<T>, { message: d.message });
  } else setForm(apiError.status === 429 ? 'Too many attempts. Please try again in a few minutes.' : apiError.message);
}

const FormError = ({ message }: Readonly<{ message: string | null }>) =>
  message ? (
    <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
      {message}
    </div>
  ) : null;

export function RegisterHostelPage() {
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<HostelValues>({ resolver: zodResolver(hostelSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const res = await authApi.registerHostel(values);
      navigate('/pending', { state: { status: 'PENDING', email: values.email, message: res.message, kind: 'hostel' } });
    } catch (err) {
      applyServerError(err, setError, setFormError);
    }
  });

  return (
    <AuthLayout
      title="Register your hostel"
      subtitle="Create your hostel workspace. A platform administrator will review it."
      footer={
        <p>
          Already approved? <AuthLink to="/login">Sign in</AuthLink>
        </p>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormError message={formError} />
        <Field label="Hostel name" error={errors.hostelName?.message}>
          <Input autoComplete="organization" {...register('hostelName')} />
        </Field>
        <Field label="Address" error={errors.address?.message}>
          <Input autoComplete="street-address" {...register('address')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City" error={errors.city?.message}>
            <Input {...register('city')} />
          </Field>
          <Field label="Contact phone" error={errors.contactPhone?.message}>
            <Input type="tel" {...register('contactPhone')} />
          </Field>
        </div>
        <Field label="Contact email" error={errors.contactEmail?.message}>
          <Input type="email" {...register('contactEmail')} />
        </Field>
        <hr className="border-border/60" />
        <p className="text-xs uppercase tracking-wide text-muted">Administrator account</p>
        <Field label="Your name" error={errors.name?.message}>
          <Input autoComplete="name" {...register('name')} />
        </Field>
        <Field label="Login email" error={errors.email?.message}>
          <Input type="email" autoComplete="email" {...register('email')} />
        </Field>
        <Field label="Password" error={errors.password?.message} hint="8+ characters with a letter and a number">
          <Input type="password" autoComplete="new-password" {...register('password')} />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Submit for approval
        </Button>
      </form>
    </AuthLayout>
  );
}

type Kind = 'student' | 'assistant';
type JoinValues = {
  hostel: { id: string; name: string; city: string } | undefined;
  name: string;
  email: string;
  password: string;
  roomNumber?: string;
};

export function RegisterJoinPage() {
  const navigate = useNavigate();
  const [kind, setKind] = useState<Kind>('student');
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<JoinValues>({
    resolver: (values, ctx, options) => zodResolver(kind === 'student' ? studentSchema : assistantSchema)(values as never, ctx, options as never) as never,
  });

  const hostel = useWatch({ control, name: 'hostel' });
  const { data: rooms = [], isFetching } = useQuery({
    queryKey: ['public-rooms', hostel?.id],
    queryFn: () => publicApi.rooms(hostel!.id),
    enabled: kind === 'student' && !!hostel?.id,
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const body = { hostelId: values.hostel!.id, name: values.name, email: values.email, password: values.password };
    try {
      const res = kind === 'student' ? await authApi.registerStudent({ ...body, roomNumber: values.roomNumber ?? '' }) : await authApi.registerAssistant(body);
      navigate('/pending', { state: { status: 'PENDING', email: values.email, message: res.message, kind } });
    } catch (err) {
      applyServerError(err, setError, setFormError);
    }
  });

  return (
    <AuthLayout
      title="Join a hostel"
      subtitle="Choose your hostel. Its administrator approves your access."
      footer={
        <p>
          Already have access? <AuthLink to="/login">Sign in</AuthLink>
        </p>
      }
    >
      <div role="tablist" aria-label="Registering as" className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-surface p-1">
        {(['student', 'assistant'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kind === k}
            onClick={() => setKind(k)}
            className={cn('rounded-md py-2 text-sm font-medium capitalize transition-colors', kind === k ? 'bg-card text-foreground shadow-card' : 'text-muted hover:text-foreground')}
          >
            {k}
          </button>
        ))}
      </div>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormError message={formError} />
        <Field label="Hostel" error={errors.hostel?.message ?? (errors.hostel as { id?: { message?: string } } | undefined)?.id?.message}>
          <Controller
            control={control}
            name="hostel"
            render={({ field }) => (
              <HostelPicker
                value={field.value ?? null}
                onChange={(h) => {
                  field.onChange(h ?? undefined);
                  setValue('roomNumber', '');
                }}
              />
            )}
          />
        </Field>
        {kind === 'student' && (
          <Field label="Room" error={errors.roomNumber?.message} hint={hostel ? undefined : 'Select a hostel first'}>
            <Select disabled={!hostel || isFetching} {...register('roomNumber')}>
              <option value="">{isFetching ? 'Loading rooms…' : 'Select your room'}</option>
              {rooms.map((room) => (
                <option key={room.id} value={room.number}>
                  Room {room.number} (floor {room.floor})
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Full name" error={errors.name?.message}>
          <Input autoComplete="name" {...register('name')} />
        </Field>
        <Field label="Email" error={errors.email?.message}>
          <Input type="email" autoComplete="email" {...register('email')} />
        </Field>
        <Field label="Password" error={errors.password?.message} hint="8+ characters with a letter and a number">
          <Input type="password" autoComplete="new-password" {...register('password')} />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Request access
        </Button>
      </form>
    </AuthLayout>
  );
}
