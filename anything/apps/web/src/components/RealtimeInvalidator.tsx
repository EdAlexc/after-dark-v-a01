'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authClient } from '@/lib/auth-client';

/**
 * S9 realtime client — one EventSource to /api/stream per signed-in tab.
 * The server emits `invalidate` events carrying TanStack Query keys; this
 * component maps them straight onto the existing caches, so every screen
 * that polled at 5–15 s now updates within a tick without changing a
 * single queryKey. EventSource reconnects on its own (each ~50 s window
 * ends server-side; auth re-runs per connection). The old polling stays as
 * a lower-frequency fallback for transports that buffer SSE.
 */
export default function RealtimeInvalidator() {
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const signedIn = Boolean(session?.user);

  useEffect(() => {
    if (!signedIn || typeof window === 'undefined' || !('EventSource' in window)) return;

    const source = new EventSource('/api/stream');
    const onInvalidate = (event: MessageEvent) => {
      try {
        const { keys } = JSON.parse(event.data) as { keys: string[][] };
        for (const key of keys) {
          void queryClient.invalidateQueries({ queryKey: key });
        }
      } catch {
        // Malformed frame — ignore; polling remains the safety net.
      }
    };
    source.addEventListener('invalidate', onInvalidate);
    return () => {
      source.removeEventListener('invalidate', onInvalidate);
      source.close();
    };
  }, [signedIn, queryClient]);

  return null;
}
