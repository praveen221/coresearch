'use client';

import { useEffect, useState } from 'react';
import type { z } from 'zod';

export function useLive<T>(url: string, schema: z.ZodType<T>, initial: T): {
  value: T; setValue: (value: T) => void; failed: boolean;
} {
  const [value, setValue] = useState(initial);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    let tag: string | null = null;
    async function refresh(): Promise<void> {
      if (pending || document.visibilityState === 'hidden') return;
      pending = true;
      try {
        const response = await fetch(url, {
          cache: 'no-store', headers: tag === null ? {} : { 'If-None-Match': tag },
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
        });
        if (response.status === 304) {
          if (!controller.signal.aborted) setFailed(false);
          return;
        }
        if (!response.ok) throw new Error(`Refresh of ${url} failed.`);
        tag = response.headers.get('etag');
        const input: unknown = await response.json();
        const saved = schema.parse(input);
        if (!controller.signal.aborted) {
          setValue(saved);
          setFailed(false);
        }
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      } finally {
        pending = false;
      }
    }
    const timer = setInterval(() => { void refresh(); }, 2000);
    return (): void => { controller.abort(); clearInterval(timer); };
  }, [url, schema]);
  return { value, setValue, failed };
}
