'use client';
import { useCallback, useEffect, useState } from 'react';

export function useIdeaFilters() {
  const [mine, setMine] = useState(false);
  const [tag, setTag] = useState('all');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [connection, setConnection] = useState('all');
  const [sort, setSort] = useState('newest');
  const [shuffle, setShuffle] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(timer);
  }, [query]);
  const clearFilters = useCallback(() => {
    setMine(false);
    setTag('all');
    setQuery('');
    setDebouncedQuery('');
    setConnection('all');
    setSort('newest');
  }, []);
  const filtered =
    mine || tag !== 'all' || connection !== 'all' || sort !== 'newest';
  return {
    mine,
    setMine,
    tag,
    setTag,
    query,
    setQuery,
    debouncedQuery,
    setDebouncedQuery,
    connection,
    setConnection,
    sort,
    setSort,
    shuffle,
    setShuffle,
    filtered,
    clearFilters,
  };
}
export type IdeaFilters = ReturnType<typeof useIdeaFilters>;
