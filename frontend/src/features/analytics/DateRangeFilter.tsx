import { useState } from 'react';
import { Field, Input, Select } from '@/components/ui/form';
import { daysAgoInput, toDateInput } from '@/utils/format';

export interface DateRangeValue {
  from: string;
  to: string;
}

const PRESETS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'Last 12 months', days: 365 },
] as const;

export const defaultRange = (): DateRangeValue => ({ from: daysAgoInput(90), to: toDateInput(new Date()) });

export function DateRangeFilter({ value, onChange }: Readonly<{ value: DateRangeValue; onChange: (v: DateRangeValue) => void }>) {
  const [preset, setPreset] = useState('90');
  return (
    <>
      <Field label="Period">
        <Select
          value={preset}
          onChange={(e) => {
            setPreset(e.target.value);
            if (e.target.value !== 'custom') onChange({ from: daysAgoInput(Number(e.target.value)), to: toDateInput(new Date()) });
          }}
        >
          {PRESETS.map((p) => (
            <option key={p.days} value={p.days}>
              {p.label}
            </option>
          ))}
          <option value="custom">Custom range</option>
        </Select>
      </Field>
      {preset === 'custom' && (
        <>
          <Field label="From">
            <Input type="date" max={value.to} value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} />
          </Field>
          <Field label="To">
            <Input type="date" min={value.from} max={toDateInput(new Date())} value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} />
          </Field>
        </>
      )}
    </>
  );
}
