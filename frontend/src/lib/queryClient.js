import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      // R23-2c: back on (React Query's own default). Cache invalidation is
      // per-browser, so it can only ever see *this* user's mutations — when the
      // Resource Manager changed an Execution Red, a Lead Manager sitting on the
      // lead's page never saw it, because nothing in that browser had mutated
      // anything. This is a multi-role app where several people work the same
      // lead at once, so "the page I left open is stale" is the normal case, not
      // an edge one. `staleTime` bounds the cost: returning to a tab refetches
      // at most once every 10 seconds per query.
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
})
