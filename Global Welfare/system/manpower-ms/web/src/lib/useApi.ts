import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';

export type ResourceResponse<T> = { data: T[]; total: number; page: number; pageSize: number };

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Could not reach the server. Check your connection and try again.';
}

export function useResource<T = any>(
  resource: string,
  params?: Record<string, string | number | boolean | undefined | null>,
  page?: number,
  pageSize?: number,
  refreshKey?: number,
) {
  const [data, setData] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const loadedFor = useRef('');
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const mutate = useCallback((id: string, patch: Partial<T>) => setData((rows) => rows.map((row: any) => row.id === id ? { ...row, ...patch } : row)), []);
  const paramsKey = JSON.stringify(params ?? null);

  useEffect(() => {
    if (!resource) {
      setData([]);
      setTotal(0);
      setLoading(false);
      setRefreshing(false);
      setError(null);
      loadedFor.current = '';
      return;
    }
    const query = new URLSearchParams();
    if (page !== undefined) query.set('page', String(page));
    if (pageSize !== undefined) query.set('pageSize', String(pageSize));
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value !== undefined && value !== null) query.set(key, String(value));
    }
    let ignore = false;
    const hadData = loadedFor.current === resource;
    if (hadData) setRefreshing(true);
    else { setData([]); setTotal(0); setLoading(true); }
    setError(null);
    api<ResourceResponse<T>>('/resource/' + encodeURIComponent(resource) + '?' + query.toString())
      .then((res) => {
        if (ignore) return;
        loadedFor.current = resource;
        setData(res.data ?? []);
        setTotal(res.total ?? 0);
      })
      .catch((err) => {
        if (ignore) return;
        if (!hadData) { setData([]); setTotal(0); }
        setError(errorMessage(err));
      })
      .finally(() => {
        if (!ignore) { setLoading(false); setRefreshing(false); }
      });
    return () => {
      ignore = true;
    };
  }, [resource, paramsKey, page, pageSize, tick, refreshKey]);

  return { data, total, loading, refreshing, error, reload, mutate, setData };
}

export function useOne<T = any>(resource: string, id?: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!resource || !id) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    let ignore = false;
    setLoading(true);
    setError(null);
    api<{ data: T }>('/resource/' + encodeURIComponent(resource) + '/' + encodeURIComponent(id))
      .then((res) => {
        if (!ignore) setData(res.data);
      })
      .catch((err) => {
        if (ignore) return;
        setData(null);
        setError(errorMessage(err));
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [resource, id, tick]);

  return { data, loading, error, reload };
}

export function useJson<T = any>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!path) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    let ignore = false;
    setLoading(true);
    setError(null);
    api<{ data: T }>(path)
      .then((res) => {
        if (!ignore) setData(res.data);
      })
      .catch((err) => {
        if (ignore) return;
        setData(null);
        setError(errorMessage(err));
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [path, tick]);

  return { data, loading, error, reload };
}

export async function postJson<T = any>(path: string, body?: unknown, method: 'POST' | 'PATCH' = 'POST'): Promise<T> {
  return api<T>(path, { method, body });
}
