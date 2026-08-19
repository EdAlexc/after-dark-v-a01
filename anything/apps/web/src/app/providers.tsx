'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Toaster } from 'sonner';
import { useEffect, useState } from 'react';
import { registerServiceWorker } from '@/lib/pwa';
import RealtimeInvalidator from '@/components/RealtimeInvalidator';
import WebVitalsReporter from '@/components/WebVitalsReporter';

// Create a client that persists across re-renders
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // With SSR, we usually want to set some default staleTime
        // above 0 to avoid refetching immediately on the client
        staleTime: 60 * 1000,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

function getQueryClient() {
  if (typeof window === 'undefined') {
    // Server: always make a new query client
    return makeQueryClient();
  } else {
    // Browser: make a new query client if we don't already have one
    if (!browserQueryClient) browserQueryClient = makeQueryClient();
    return browserQueryClient;
  }
}

export function Providers({ children }: { children: ReactNode }) {
  // Initialize query client once
  const [queryClient] = useState(() => getQueryClient());

  // PWA (P10.2): production-only, no-op where unsupported.
  useEffect(() => {
    registerServiceWorker();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {/* S9: SSE → query invalidation for signed-in tabs (no-op signed out). */}
      <RealtimeInvalidator />
      {/* S18: first-party Core Web Vitals beacon (production-only). */}
      <WebVitalsReporter />
      {children}
      <Toaster position="bottom-right" />
    </QueryClientProvider>
  );
}
