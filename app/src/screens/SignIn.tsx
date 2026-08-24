import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { Icon } from '../components/Icon'
import { ErrorNote, Spinner } from '../components/ui'

/**
 * Returning users only - new users go to /signup, where the role and details
 * are collected. Email + password rather than a magic link: see the comment on
 * `signIn` in AuthProvider for why the link could not be made reliable on
 * Android mail clients.
 */
export function SignIn() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ready = email.trim().length > 3 && password.length >= 6

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    setError(null)
    try {
      await signIn(email, password)
      // No navigation needed - onAuthStateChange fires and the router swaps
      // this screen out.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen-in safe-top safe-bottom flex min-h-dvh flex-col justify-center px-margin-mobile">
      <div className="mb-stack-md flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-on-primary">
          <Icon name="tree" size={20} />
        </span>
        <span className="font-headline text-headline-md font-bold text-on-surface">
          GreenProof
        </span>
      </div>

      <h1 className="font-headline text-display-md font-bold text-on-surface">
        Welcome back
      </h1>
      <p className="mt-2 text-on-surface-variant">Sign in to your trees.</p>

      <form onSubmit={submit} className="mt-stack-md">
        <label className="label" htmlFor="email">
          Email address
        </label>
        <input
          id="email"
          className="field"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />

        <label className="label mt-stack-sm" htmlFor="password">
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            className="field pr-20"
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-label-lg font-semibold text-on-surface-variant"
            aria-label={show ? 'Hide password' : 'Show password'}
          >
            {show ? 'Hide' : 'Show'}
          </button>
        </div>

        <button
          type="submit"
          className="btn btn-primary btn-block btn-cta mt-stack-md"
          disabled={busy || !ready}
        >
          {busy ? <Spinner /> : 'Sign in'}
        </button>

        {error && <ErrorNote>{error}</ErrorNote>}
      </form>

      <div className="mt-stack-md text-center">
        <span className="text-on-surface-variant">First time here?</span>{' '}
        <Link
          to="/signup"
          className="font-semibold text-primary underline underline-offset-4"
        >
          Create an account
        </Link>
      </div>
    </div>
  )
}
