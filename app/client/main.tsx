// app/client/main.tsx
// Boot: render the app. soii runs on this machine only, so there is no sign-in.
import './lib/zod-config'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { HttpError } from './lib/http'
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

installScrollbars()

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <App />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>
)
