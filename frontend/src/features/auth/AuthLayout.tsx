import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Building2, ClipboardCheck, LineChart } from 'lucide-react';
import { Logo } from '@/components/common/common';

const HIGHLIGHTS = [
  { icon: Building2, text: 'Every hostel is its own isolated workspace' },
  { icon: ClipboardCheck, text: 'Report, assign and resolve issues with proof' },
  { icon: LineChart, text: 'Live analytics and one-click PDF reports' },
];

export function AuthLayout({ title, subtitle, children, footer }: Readonly<{ title: string; subtitle: string; children: ReactNode; footer?: ReactNode }>) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-border/60 p-12 lg:flex">
        <div className="pointer-events-none absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-primary/20 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute bottom-0 right-0 h-64 w-64 rounded-full bg-accent/10 blur-3xl" aria-hidden />
        <Logo />
        <div className="relative max-w-md">
          <h2 className="text-4xl font-semibold leading-tight tracking-tight">
            Run your hostel <span className="gradient-text">without the paperwork</span>
          </h2>
          <ul className="mt-8 space-y-4">
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-muted">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-card/70 text-accent">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-muted">Multi-tenant hostel management platform</p>
      </aside>

      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md animate-fade-up">
          <Logo className="mb-8 lg:hidden" />
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
          <div className="mt-6">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

export const AuthLink = ({ to, children }: Readonly<{ to: string; children: ReactNode }>) => (
  <Link to={to} className="font-medium text-accent underline-offset-4 hover:underline">
    {children}
  </Link>
);
