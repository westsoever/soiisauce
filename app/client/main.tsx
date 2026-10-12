// app/client/main.tsx
// Boot: ask /api/me who's signed in. 401 → login; 500 misconfigured → login
// with the missing env names; otherwise the app.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { LoginScreen } from './components/LoginScreen'
import { HttpError } from './lib/http'
import { useMe } from './lib/queries'
import { installScrollbars } from './lib/scrollbars'
import { Toaster } from './lib/toast'
import { TooltipProvider } from './ui/tooltip'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (count, error) => !(error instanceof HttpError && error.status < 500) && count < 2
    }
  }
})

function Gate() {
  const me = useMe()
  if (me.isPending) return null
  if (me.error instanceof HttpError) {
    const body = me.error.body as { error?: string; missing?: string[] } | null
    if (me.error.status === 401) return <LoginScreen />
    if (body?.error === 'misconfigured') return <LoginScreen missing={body.missing ?? []} />
  }
  if (me.isError) return <p className="p-8 text-sm">soii. couldn't reach its server: {me.error.message}</p>
  return <App />
}

installScrollbars()

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Gate />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>
)
