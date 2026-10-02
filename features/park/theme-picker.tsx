'use client';
import { useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { parkThemes } from './themes';
export function ThemePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const choices = [
    { id: 'all', label: 'All ideas', color: '#bdd4c3' },
    ...parkThemes,
  ];
  return (
    <div className="park-themes">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className="park-theme-trigger"
          aria-label="Browse idea themes"
        >
          {choices.find((theme) => theme.id === value)?.label || 'All ideas'}
          <ChevronDown size={16} />
        </PopoverTrigger>
        <PopoverContent className="park-theme-menu" align="end" sideOffset={8}>
          <PopoverTitle className="sr-only">Browse idea themes</PopoverTitle>
          {choices.map((theme) => (
            <button
              key={theme.id}
              aria-pressed={value === theme.id}
              onClick={() => {
                onChange(theme.id);
                setOpen(false);
              }}
            >
              <i style={{ background: theme.color }} />
              {theme.label}
              {value === theme.id && <Check size={16} />}
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}
