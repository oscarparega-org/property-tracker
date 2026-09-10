'use client';

import { useCallback, useEffect, useState } from 'react';
import { requestApi } from './request-api';

const values = new Map<string, unknown>();
const requests = new Map<string, Promise<unknown>>();

async function load<T>(path: string, force = false) {
  if (!force && values.has(path)) return values.get(path) as T;
  if (!force && requests.has(path)) return requests.get(path) as Promise<T>;
  const request = requestApi<T>(path).then((value) => {
    values.set(path, value);
    requests.delete(path);
    return value;
  });
  requests.set(path, request);
  return request;
}

export function invalidateApiResource(path: string) {
  values.delete(path);
}

export function useApiResource<T>(path: string) {
  const [data, setData] = useState<T | null>(() => (values.get(path) as T | undefined) ?? null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => {
    invalidateApiResource(path);
    setRevision((value) => value + 1);
  }, [path]);
  useEffect(() => {
    let active = true;
    setError('');
    void load<T>(path, revision > 0)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'No fue posible cargar la información.');
      });
    return () => {
      active = false;
    };
  }, [path, revision]);
  return { data, error, refresh };
}
