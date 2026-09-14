'use client';
import { useState, useEffect, useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { requestJSON } from '@/lib/client';
import { normalizeTag, validTag } from '@/lib/garden';

export function useTags(query = '') {
  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 180);
    return () => clearTimeout(timer);
  }, [query]);
  return useQuery({
    queryKey: ['tags', debounced],
    queryFn: () =>
      requestJSON<{ tags: { tag: string; count: number }[] }>(
        `/api/tags?q=${encodeURIComponent(debounced)}`,
      ),
    enabled: Boolean(debounced) && debounced === query,
    staleTime: 30000,
  });
}

export function TagSearch({
  id,
  onChoose,
  selected = [],
  allowCreate = false,
  disabled = false,
}: {
  id?: string;
  onChoose: (tag: string) => void;
  selected?: string[];
  allowCreate?: boolean;
  disabled?: boolean;
}) {
  const generatedId = useId(),
    listId = `${generatedId}-suggestions`;
  const [query, setQuery] = useState(''),
    [focused, setFocused] = useState(false),
    [active, setActive] = useState(-1);
  const normalized = normalizeTag(query),
    result = useTags(normalized);
  const matches = (result.data?.tags || [])
    .filter((t) => t.tag.includes(normalized) && !selected.includes(t.tag))
    .slice(0, 5);
  const canCreate =
    allowCreate &&
    validTag(normalized) &&
    !selected.includes(normalized) &&
    !matches.some((t) => t.tag === normalized);
  const choices = [
    ...matches.map((t) => ({ ...t, create: false })),
    ...(canCreate ? [{ tag: normalized, count: 0, create: true }] : []),
  ];
  const open = focused && Boolean(normalized) && !disabled;
  function choose(tag: string) {
    onChoose(tag);
    setQuery('');
    setActive(-1);
  }
  return (
    <div className="tag-search">
      <Input
        id={id || generatedId}
        role="combobox"
        aria-label={allowCreate ? 'Find or create a tag' : 'Find a tag'}
        aria-autocomplete="list"
        aria-expanded={open && choices.length > 0}
        aria-controls={listId}
        aria-activedescendant={
          open && active >= 0 && active < choices.length
            ? `${listId}-${active}`
            : undefined
        }
        autoComplete="off"
        placeholder={allowCreate ? 'Type a tag…' : 'Find a tag…'}
        maxLength={40}
        disabled={disabled}
        value={query}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(-1);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setFocused(true);
            setActive((current) =>
              choices.length
                ? current < 0
                  ? e.key === 'ArrowDown'
                    ? 0
                    : choices.length - 1
                  : (current +
                      (e.key === 'ArrowDown' ? 1 : -1) +
                      choices.length) %
                    choices.length
                : -1,
            );
          }
          if (e.key === 'Escape' && open) {
            e.preventDefault();
            e.stopPropagation();
            setFocused(false);
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            const choice = choices[active >= 0 ? active : 0];
            if (open && choice) choose(choice.tag);
          }
        }}
      />
      {open && choices.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Suggested tags"
          className="tag-suggestions"
        >
          {choices.map((t, index) => (
            <li
              key={t.tag}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={active === index}
              onPointerDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(t.tag)}
            >
              <span>
                {t.create ? 'Add ' : ''}#{t.tag}
              </span>
              {t.count > 0 && <small>{t.count}</small>}
            </li>
          ))}
        </ul>
      )}
      {open && !choices.length && (
        <p className="tag-hint" role="status">
          {result.isFetching || result.isPending
            ? 'Searching…'
            : result.isError
              ? 'Couldn’t load tags.'
              : 'No matching tags.'}
        </p>
      )}
    </div>
  );
}

export function TagPicker({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  disabled: boolean;
}) {
  const suggestions = [
    { tag: 'housing', label: 'Housing' },
    { tag: 'public-spaces', label: 'Public spaces' },
    { tag: 'transit', label: 'Transit' },
    { tag: 'parks', label: 'Parks' },
    { tag: 'arts', label: 'Arts' },
  ];
  // Preserve any custom tags already in a draft, without adding another creation flow.
  const choices = [
    ...suggestions,
    ...value
      .filter((tag) => !suggestions.some((item) => item.tag === tag))
      .map((tag) => ({ tag, label: tag.replaceAll('-', ' ') })),
  ];
  return (
    <fieldset className="suggested-topics" disabled={disabled}>
      <legend>
        Topics <span>optional</span>
      </legend>
      <div className="topic-chips">
        {choices.map(({ tag, label }) => {
          const selected = value.includes(tag);
          return (
            <button
              type="button"
              key={tag}
              aria-pressed={selected}
              disabled={disabled || (!selected && value.length >= 3)}
              onClick={() =>
                onChange(
                  selected
                    ? value.filter((item) => item !== tag)
                    : [...value, tag],
                )
              }
            >
              {selected && <Check size={13} aria-hidden="true" />}
              {label}
            </button>
          );
        })}
      </div>
      {value.length >= 3 && (
        <output className="topic-limit">Up to 3 topics.</output>
      )}
    </fieldset>
  );
}
