import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils/cn';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('glass rounded-xl', className)} {...props} />;
}

export function CardHeader({ title, description, action, className }: Readonly<{ title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }>) {
  return (
    <div className={cn('flex items-start justify-between gap-3 border-b border-border/60 px-5 py-4', className)}>
      <div className="min-w-0">
        <h2 className="truncate text-base font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...props} />;
}
