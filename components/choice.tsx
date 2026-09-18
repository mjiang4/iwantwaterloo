'use client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
export function Choice({
  value,
  onChange,
  label,
  items,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  items: { value: string; label: string }[];
  id?: string;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (v !== null) onChange(v);
      }}
      items={items}
    >
      <SelectTrigger id={id} className="choice" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="choice-menu">
        {items.map((i) => (
          <SelectItem key={i.value} value={i.value}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
