import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  Building2,
  ClipboardList,
  DoorOpen,
  LayoutDashboard,
  LogOut,
  Menu,
  PlusCircle,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { Logo } from '@/components/common/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/AuthContext';
import type { Role } from '@/types';
import { ROLE_LABEL } from '@/utils/format';
import { cn } from '@/utils/cn';

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  end?: boolean;
}

export const NAV: Record<Role, NavItem[]> = {
  PLATFORM_ADMIN: [
    { to: '/platform', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/platform/approvals', label: 'Approvals', icon: ShieldCheck },
    { to: '/platform/hostels', label: 'Hostels', icon: Building2 },
  ],
  HOSTEL_ADMIN: [
    { to: '/hostel', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/hostel/issues', label: 'Issues', icon: ClipboardList },
    { to: '/hostel/approvals', label: 'Approvals', icon: ShieldCheck },
    { to: '/hostel/people', label: 'People', icon: Users },
    { to: '/hostel/rooms', label: 'Rooms', icon: DoorOpen },
    { to: '/hostel/analytics', label: 'Analytics', icon: BarChart3 },
  ],
  ASSISTANT: [
    { to: '/assistant', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/assistant/issues', label: 'My issues', icon: ClipboardList },
  ],
  STUDENT: [
    { to: '/student', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/student/issues', label: 'My issues', icon: ClipboardList },
    { to: '/student/new', label: 'Report an issue', icon: PlusCircle },
  ],
};

function SidebarNav({ items, onNavigate }: Readonly<{ items: NavItem[]; onNavigate?: () => void }>) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              isActive ? 'bg-primary/15 text-foreground shadow-[inset_2px_0_0_0_rgb(var(--primary))]' : 'text-muted hover:bg-card/60 hover:text-foreground',
            )
          }
        >
          <Icon className="h-4 w-4 shrink-0" aria-hidden />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

function ProfileMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;
  const initials = user.name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open profile menu"
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-card/60"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-xs font-semibold text-background">{initials}</span>
        <span className="hidden text-left sm:block">
          <span className="block text-sm font-medium leading-tight">{user.name}</span>
          <span className="block text-xs text-muted">{ROLE_LABEL[user.role]}</span>
        </span>
      </button>
      {open && (
        <div role="menu" className="glass absolute right-0 z-40 mt-2 w-64 animate-fade-up rounded-xl bg-surface p-2">
          <div className="px-3 py-2">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
            {user.hostel && <p className="mt-1 truncate text-xs text-accent">{user.hostel.name}</p>}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger transition-colors hover:bg-danger/10"
          >
            <LogOut className="h-4 w-4" aria-hidden /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function AppShell() {
  const { user } = useAuth();
  const [drawer, setDrawer] = useState(false);

  if (!user) return null;
  const items = NAV[user.role];

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-border/70 bg-surface/60 p-4 backdrop-blur-md lg:flex">
        <Logo className="mb-8 px-2 pt-2" />
        <SidebarNav items={items} />
        <div className="mt-auto rounded-xl border border-border/60 bg-card/40 p-3 text-xs text-muted">
          <Badge tone="accent">{ROLE_LABEL[user.role]}</Badge>
          {user.hostel && <p className="mt-2 truncate text-foreground/90">{user.hostel.name}</p>}
        </div>
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-black/60" onClick={() => setDrawer(false)} />
          <div className="relative flex h-full w-72 max-w-[85vw] animate-fade-up flex-col bg-surface p-4">
            <div className="mb-6 flex items-center justify-between">
              <Logo />
              <Button variant="ghost" size="icon" aria-label="Close menu" onClick={() => setDrawer(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <SidebarNav items={items} onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border/70 bg-background/70 px-4 backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" onClick={() => setDrawer(true)}>
              <Menu className="h-5 w-5" />
            </Button>
            <Logo className="lg:hidden" />
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="Notifications (none)" disabled>
              <Bell className="h-4 w-4" />
            </Button>
            <ProfileMenu />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
