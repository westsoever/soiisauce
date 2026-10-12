// app/client/components/LoginScreen.tsx
// Sign in with GitHub (spec §8.1, §9). Shows ?auth_error messages and, when the
// deployment is misconfigured, which env var names are missing.
import { IconBrandGithub } from '@tabler/icons-react'
import { buttonVariants } from '../ui/button'

const ERRORS: Record<string, string> = {
  state: 'That sign-in link expired. Try again.',
  github: "GitHub didn't finish the sign-in. Try again.",
  misconfigured: "This soii isn't fully configured yet."
}

export function LoginScreen({ missing = [] }: { missing?: string[] }) {
  const params = new URLSearchParams(location.search)
  const code = params.get('auth_error')
  const login = params.get('login')
  const error = code === 'not_allowed' ? `@${login ?? 'that account'} isn't on this soii's allowlist.` : code ? (ERRORS[code] ?? 'Sign-in failed.') : null

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted p-4">
      <div className="flex w-full max-w-sm flex-col gap-5 rounded-xl bg-background p-6 shadow-sm">
        <div className="flex flex-col gap-1">
          <h1 className="text-base font-medium">soii.</h1>
          <p className="text-sm text-muted-foreground">Sign in to read your vault.</p>
        </div>
        {missing.length > 0 ? (
          <div className="rounded-lg bg-muted px-3 py-2 text-sm">
            <p className="font-medium">Missing configuration</p>
            <p className="text-muted-foreground">Set these environment variables in Vercel, then redeploy:</p>
            <ul className="mt-1 font-mono text-xs">
              {missing.map(name => (
                <li key={name}>
                  {name}
                  {name === 'SOII_SESSION_SECRET' ? ' (at least 32 characters)' : ''}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <a href="/api/auth/login" className={buttonVariants({ size: 'lg' })}>
            <IconBrandGithub stroke={1.5} />
            Continue with GitHub
          </a>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </div>
  )
}
