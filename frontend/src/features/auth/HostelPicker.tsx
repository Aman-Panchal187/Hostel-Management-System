import { useEffect, useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Search } from 'lucide-react';
import { Input } from '@/components/ui/form';
import { publicApi } from '@/services/endpoints';
import type { PublicHostel } from '@/types';
import { cn } from '@/utils/cn';

interface Props {
  id?: string;
  value: PublicHostel | null;
  onChange: (hostel: PublicHostel | null) => void;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

/** Searchable combobox over approved hostels (server-side search, keyboard accessible). */
export function HostelPicker({ id, value, onChange, ...aria }: Readonly<Props>) {
  const listId = useId();
  const [text, setText] = useState(value?.name ?? '');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);

  const { data = [], isFetching } = useQuery({
    queryKey: ['public-hostels', value ? '' : debounced],
    queryFn: () => publicApi.hostels(value ? undefined : debounced || undefined),
    staleTime: 30_000,
  });

  const choose = (hostel: PublicHostel) => {
    onChange(hostel);
    setText(hostel.name);
    setOpen(false);
  };

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted" aria-hidden />
      <Input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && data[active] ? `${listId}-${data[active].id}` : undefined}
        autoComplete="off"
        className="pl-9"
        placeholder="Search for your hostel"
        value={text}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => {
          setText(e.target.value);
          if (value) onChange(null);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, data.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter' && open && data[active]) {
            e.preventDefault();
            choose(data[active]);
          } else if (e.key === 'Escape') setOpen(false);
        }}
        {...aria}
      />
      {open && (
        <ul id={listId} role="listbox" aria-label="Approved hostels" className="glass absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-lg bg-surface p-1">
          {data.length === 0 && <li className="px-3 py-2 text-sm text-muted">{isFetching ? 'Searching…' : 'No approved hostels found'}</li>}
          {data.map((hostel, index) => (
            <li
              key={hostel.id}
              id={`${listId}-${hostel.id}`}
              role="option"
              aria-selected={value?.id === hostel.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(hostel)}
              onMouseEnter={() => setActive(index)}
              className={cn('flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm', index === active && 'bg-primary/15')}
            >
              <span>
                {hostel.name} <span className="text-muted">· {hostel.city}</span>
              </span>
              {value?.id === hostel.id && <Check className="h-4 w-4 text-accent" aria-hidden />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
