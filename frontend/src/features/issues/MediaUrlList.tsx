import { useState } from 'react';
import { Film, ImageIcon, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import type { MediaInput, MediaType } from '@/types';

/** Client-side mirror of the server rule: absolute HTTPS URLs only. */
export function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

interface Props {
  value: MediaInput[];
  onChange: (items: MediaInput[]) => void;
  max?: number;
  label: string;
}

export function MediaUrlList({ value, onChange, max = 5, label }: Readonly<Props>) {
  const [url, setUrl] = useState('');
  const [mediaType, setMediaType] = useState<MediaType>('IMAGE');
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    const trimmed = url.trim();
    if (!isHttpsUrl(trimmed)) return setError('Enter a valid https:// link');
    if (value.some((item) => item.url === trimmed)) return setError('This link was already added');
    onChange([...value, { url: trimmed, mediaType }]);
    setUrl('');
    setError(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          aria-label={label}
          aria-invalid={error ? true : undefined}
          placeholder="https://… link to a photo or video"
          value={url}
          disabled={value.length >= max}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <Select aria-label="Media type" className="sm:w-32" value={mediaType} onChange={(e) => setMediaType(e.target.value as MediaType)}>
          <option value="IMAGE">Image</option>
          <option value="VIDEO">Video</option>
        </Select>
        <Button type="button" variant="secondary" onClick={add} disabled={value.length >= max}>
          <Plus className="h-4 w-4" aria-hidden /> Add
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      {value.length > 0 && (
        <ul className="space-y-1.5">
          {value.map((item) => (
            <li key={item.url} className="flex items-center gap-2 rounded-lg border border-border bg-surface/60 px-3 py-1.5 text-sm">
              {item.mediaType === 'IMAGE' ? <ImageIcon className="h-4 w-4 text-accent" aria-hidden /> : <Film className="h-4 w-4 text-accent" aria-hidden />}
              <span className="min-w-0 flex-1 truncate">{item.url}</span>
              <button type="button" aria-label={`Remove ${item.url}`} className="text-muted hover:text-danger" onClick={() => onChange(value.filter((m) => m.url !== item.url))}>
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
