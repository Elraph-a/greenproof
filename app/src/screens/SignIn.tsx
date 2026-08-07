import { useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { Icon } from '../components/Icon'
import { ErrorNote, Spinner } from '../components/ui'

export function SignIn() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email)
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the link')
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <div className="safe-top safe-bottom flex min-h-dvh flex-col justify-center px-margin-mobile text-center">
        <div className="mx-auto mb-stack-md flex size-20 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
          <Icon name="mail" size={36} />
        </div>
        <h1 className="font-headline text-headline-lg font-bold text-on-surface">
          Check your email
        </h1>
        <p className="mt-2 text-on-surface-variant">
          We sent a sign-in link to{' '}
          <strong className="text-on-surface">{email}</strong>. Open it on this
          phone.
        </p>
        <button
          type="button"
          className="btn btn-ghost mx-auto mt-stack-md"
          onClick={() => setSent(false)}
        >
          Use a different email
        </button>
      </div>
    )
  }

  return (
    <div className="safe-top safe-bottom flex min-h-dvh flex-col justify-center px-margin-mobile">
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
      <p className="mt-2 text-on-surface-variant">
        No password needed — we email you a link.
      </p>

      {/* A magic link is unusual enough in Ghana that saying why is worth the
          two lines: it removes the "I forgot my password" failure entirely,
          which matters when the user is standing in a field. */}
      <div className="note mt-stack-sm flex gap-2.5">
        <Icon name="shield" size={16} className="mt-0.5 shrink-0 text-on-surface-variant" />
        <p className="text-label-lg text-on-surface-variant">
          No password to forget. Open the link on this phone and you are in.
        </p>
      </div>

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
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />

        <button
          type="submit"
          className="btn btn-primary btn-block btn-cta mt-stack-sm"
          disabled={busy || email.trim().length < 4}
        >
          {busy ? <Spinner /> : 'Send me a link'}
        </button>

        {error && <ErrorNote>{error}</ErrorNote>}
      </form>
    </div>
  )
}
