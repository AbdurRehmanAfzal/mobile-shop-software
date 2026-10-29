import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import '@/i18n'
import '@/index.css'
import '@/lib/theme'
import { router } from '@/app/router'

// offline mode (owner 2026-10-29): what was loaded stays on the phone for a day, so stock, khata and
// the sale screen open without the internet; documents made offline wait in lib/offline.ts.
const DAY = 24 * 60 * 60 * 1000
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000, gcTime: DAY },
    mutations: { networkMode: 'always' },
  },
})
const persister = createSyncStoragePersister({ storage: window.localStorage, key: 'mobileshop.cache', throttleTime: 500 })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: DAY, buster: 'v1', dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === 'success' } }}
      // what came back from storage is shown at once but is old: refetch it when there is a connection
      onSuccess={() => { void queryClient.invalidateQueries() }}
    >
      <RouterProvider router={router} />
    </PersistQueryClientProvider>
  </React.StrictMode>,
)
