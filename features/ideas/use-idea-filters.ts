'use client';
import { useCallback, useEffect, useState } from 'react';

export function useIdeaFilters() {
  const [place, setPlace] = useState('all');
  const [mine, setMine] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [sort, setSort] = useState('discover');
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
    setSort('discover');
  }, []);
  const filtered = place !== 'all' || mine || sort !== 'discover';
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
