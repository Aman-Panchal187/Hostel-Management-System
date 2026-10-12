import type { HTMLAttributes } from 'react';
import { cn } from '@/utils/cn';

const tones = {
  neutral: 'bg-muted/15 text-muted ring-muted/25',
  primary: 'bg-primary/15 text-primary ring-primary/30',
  accent: 'bg-accent/15 text-accent ring-accent/30',
  success: 'bg-success/15 text-success ring-success/30',
  warning: 'bg-warning/15 text-warning ring-warning/30',
  danger: 'bg-danger/15 text-danger ring-danger/30',
} as const;

export type Tone = keyof typeof tones;

export function Badge({ tone = 'neutral', className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', tones[tone], className)}
      {...props}
    />
  );
}
