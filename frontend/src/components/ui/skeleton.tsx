import { cn } from '@/utils/cn';

export function Skeleton({ className }: Readonly<{ className?: string }>) {
  return <div aria-hidden className={cn('skeleton h-4 w-full', className)} />;
}
