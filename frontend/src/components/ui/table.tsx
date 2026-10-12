import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '@/utils/cn';

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full min-w-[640px] text-left text-sm', className)} {...props} />
    </div>
  );
}

export const THead = (props: HTMLAttributes<HTMLTableSectionElement>) => <thead className="border-b border-border/70 text-xs uppercase tracking-wide text-muted" {...props} />;
export const TBody = (props: HTMLAttributes<HTMLTableSectionElement>) => <tbody className="divide-y divide-border/50" {...props} />;
export const Tr = ({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) => <tr className={cn('transition-colors hover:bg-card/40', className)} {...props} />;
export const Th = ({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) => <th scope="col" className={cn('px-4 py-3 font-medium', className)} {...props} />;
export const Td = ({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) => <td className={cn('px-4 py-3 align-middle', className)} {...props} />;
