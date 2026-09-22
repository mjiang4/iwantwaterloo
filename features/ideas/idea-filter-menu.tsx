'use client';
import { useEffect, useState } from 'react';
import { SlidersHorizontal, Shuffle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Choice } from '@/components/choice';
import { TagSearch } from '@/components/tag-picker';
import { CONNECTIONS } from '@/lib/garden';
import type { IdeaFilters } from './use-idea-filters';

export function IdeaFilterMenu({
  filters,
  loading,
  placeholder,
  failed,
}: {
  filters: IdeaFilters;
  loading: boolean;
  placeholder: boolean;
  failed: boolean;
}) {
  const {
    tag,
    setTag,
    connection,
    setConnection,
    sort,
    setSort,
    shuffle,
    setShuffle,
    filtered,
    clearFilters,
  } = filters;
  const [filterOpen, setFilterOpen] = useState(false);
  const [shuffleRequested, setShuffleRequested] = useState(false);
  const [shuffleNotice, setShuffleNotice] = useState('');
  useEffect(() => {
    if (!shuffleRequested || loading || placeholder) return;
    // Announce the completion of an explicit shuffle request.
    // oxlint-disable-next-line react/react-compiler
    setShuffleRequested(false);
    setShuffleNotice(
      failed ? 'Couldn’t reshuffle. Try again.' : 'Ideas reshuffled.',
    );
  }, [shuffleRequested, loading, placeholder, failed]);
  return (
    <>
      {' '}
      <Popover open={filterOpen} onOpenChange={setFilterOpen}>
        <PopoverTrigger
          className={`icon-button ${filtered ? 'has-filter' : ''}`}
          aria-label="Filter ideas"
        >
          <SlidersHorizontal size={18} />
        </PopoverTrigger>
        <PopoverContent className="filter-popover" align="end">
          <PopoverTitle className="popover-heading">Filter ideas</PopoverTitle>
          <label htmlFor="filter-tag-search">Tags</label>
          <TagSearch id="filter-tag-search" onChoose={setTag} />
          {tag !== 'all' && (
            <div className="tag-options selected-tags">
              <button
                type="button"
                onClick={() => setTag('all')}
                aria-label={`Remove tag ${tag}`}
              >
                #{tag}
                <X size={12} />
              </button>
            </div>
          )}
          <div className="filter-field-label">Sort</div>
          <Choice
            label="Sort ideas"
            value={sort}
            onChange={(value) => {
              setSort(value);
              if (value === 'random')
                setShuffle(
                  (current) =>
                    (current + 1 + Math.floor(Math.random() * 61)) % 64,
                );
            }}
            items={[
              { value: 'discover', label: 'Discover' },
              { value: 'newest', label: 'New' },
              { value: 'needs-input', label: 'Needs input' },
              { value: 'progress', label: 'Taking shape' },
              { value: 'watered', label: 'Most liked' },
              { value: 'random', label: 'Random' },
            ]}
          />
          {sort === 'random' && (
            <button
              className="tag-done reshuffle-button"
              type="button"
              disabled={loading || shuffleRequested}
              aria-busy={shuffleRequested}
              onClick={() => {
                setShuffleRequested(true);
                setShuffleNotice('');
                setShuffle(
                  (current) =>
                    (current + 1 + Math.floor(Math.random() * 61)) % 64,
                );
              }}
            >
              <Shuffle
                key={shuffle}
                size={15}
                className={
                  shuffleRequested || shuffleNotice ? 'shuffle-feedback' : ''
                }
                aria-hidden="true"
              />
              Reshuffle
            </button>
          )}
          <label htmlFor="filter-connection">Connection</label>
          <Choice
            id="filter-connection"
            label="Filter connection"
            value={connection}
            onChange={setConnection}
            items={[
              { value: 'all', label: 'Everyone' },
              ...CONNECTIONS.map((c) => ({ value: c, label: c })),
            ]}
          />
          <div className="filter-actions">
            <Button variant="ghost" onClick={clearFilters}>
              Reset
            </Button>
            <Button onClick={() => setFilterOpen(false)}>Done</Button>
          </div>
        </PopoverContent>
      </Popover>
      <output className="sr-only">{shuffleNotice}</output>
    </>
  );
}
