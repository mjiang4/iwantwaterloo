'use client';
import { useCallback, useEffect, useState } from 'react';

export function useIdeaFilters() {
  const [place, setPlace] = useState('all');
  const [mine, setMine] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [sort, setSort] = useState('newest');
  const [shuffle, setShuffle] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(timer);
  }, [query]);
  const clearFilters = useCallback(() => {
    setMine(false);
    setPlace('all');
    setQuery('');
    setDebouncedQuery('');
    setSort('newest');
  }, []);
  const filtered = place !== 'all' || mine || sort !== 'newest';
  return {
    place,
    setPlace,
    mine,
    setMine,
    query,
    setQuery,
    debouncedQuery,
    setDebouncedQuery,
    sort,
    setSort,
    shuffle,
    setShuffle,
    filtered,
    clearFilters,
  };
}
export type IdeaFilters = ReturnType<typeof useIdeaFilters>;
