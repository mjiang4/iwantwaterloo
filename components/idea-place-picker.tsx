'use client';
import { ChevronDown } from 'lucide-react';
import { useMediaQuery } from '@/hooks/use-media-query';
import { IDEA_PLACES, isIdeaPlace, type IdeaPlace } from '@/lib/idea-places';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

export function IdeaPlacePicker({
  value,
  onChange,
  disabled,
}: {
  value: IdeaPlace;
  onChange: (value: IdeaPlace) => void;
  disabled: boolean;
}) {
  const touch = useMediaQuery('(pointer: coarse)');
  const choose = (next: unknown) => {
    if (isIdeaPlace(next)) onChange(next);
  };
  return (
    <div className="idea-place-picker">
      <label htmlFor="idea-place">Where</label>
      {touch ? (
        <div className="place-native-wrap">
          <select
            id="idea-place"
            value={value}
            disabled={disabled}
            onChange={(event) => choose(event.target.value)}
          >
            {IDEA_PLACES.map((place) => (
              <option key={place} value={place}>
                {place}
              </option>
            ))}
          </select>
          <ChevronDown size={16} aria-hidden="true" />
        </div>
      ) : (
        <Select
          value={value}
          onValueChange={choose}
          disabled={disabled}
          items={IDEA_PLACES.map((place) => ({ value: place, label: place }))}
        >
          <SelectTrigger
            id="idea-place"
            className="place-trigger"
            aria-label="Where"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent
            className="place-menu"
            align="start"
            alignItemWithTrigger={false}
            sideOffset={6}
          >
            {IDEA_PLACES.map((place) => (
              <SelectItem key={place} value={place}>
                {place}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
