import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { Icon } from '../components/Icon'
import { RoleCard } from '../components/RoleCard'
import { ErrorNote, Spinner } from '../components/ui'

/**
 * The whole of joining, on one screen: who you are, which side of the product
 * you are on, and a password. Deliberately ONE form — the previous flow split
 * this into sign-up then a separate profile-setup screen, and nothing forced a
 * new user through the second one, so people could land in the app with no
 * name and the wrong home screen.
 *
 * The role is the first question because it decides everything downstream:
 * a planter's home is the camera, a sponsor's is the evidence. See
 * AuthProvider.signUp for why account + profile + role are written in one
 * call rather than from here in steps.
 */
export function CreateAccount() {
  const { signUp } = useAuth()
  const navigate = useNavigate()

  const [role, setRole] = useState<'planter' | 'sponsor'>('planter')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mismatch = confirm.length > 0 && confirm !== password
  const ready =
    fullName.trim().length > 0 &&
    email.trim().length > 3 &&
    password.length >= 6 &&
    confirm === password

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    setError(null)
    try {
      await signUp(email, password, {
        fullName,
        phone,
        role,
      })
      navigate(role === 'sponsor' ? '/sponsor' : '/grove', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create account')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen-in flex min-h-dvh flex-col bg-background">
      <header className="safe-top px-margin-mobile pt-4">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-on-primary">
            <Icon name="tree" size={20} />
          </span>
          <span className="font-headline text-headline-md font-bold text-on-surface">
            GreenProof
          </span>
        </div>
        <h1 className="mt-stack-sm font-headline text-display-md font-bold text-on-surface">
          Join GreenProof
        </h1>
        <p className="mt-1 text-on-surface-variant">
          One minute, and your trees are on the record.
        </p>
      </header>

      <main className="flex-1 px-margin-mobile pt-stack-md pb-3">
        <form id="join-form" onSubmit={submit}>
          <h2 className="mb-2 text-label-lg font-semibold text-on-surface">
            How will you use GreenProof?
          </h2>
          <div className="flex flex-col gap-2.5">
            <RoleCard
              icon="tree"
              title="I want to plant trees"
              body="Register the trees you plant, check in on them, and earn for every one that survives."
              selected={role === 'planter'}
              onSelect={() => setRole('planter')}
            />
            <RoleCard
              icon="wallet"
              title="I want to sponsor trees"
              body="Fund trees and see verified proof they are still alive, with the photos and the survival rate."
              selected={role === 'sponsor'}
              onSelect={() => setRole('sponsor')}
            />
          </div>

          <div className="mt-stack-md">
            <label className="label" htmlFor="name">Full name</label>
            <input
              id="name"
              className="field"
              required
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>

          <div className="mt-stack-sm">
            <label className="label" htmlFor="phone">Phone number</label>
            <input
              id="phone"
              className="field"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="024 000 0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <p className="mt-1.5 text-label-md text-on-surface-variant">
              {role === 'sponsor'
                ? 'Used for Mobile Money when you fund trees.'
                : 'Used for Mobile Money payouts.'}
            </p>
          </div>

          <div className="mt-stack-sm">
            <label className="label" htmlFor="email">Email address</label>
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
          </div>

          <div className="mt-stack-sm">
            <label className="label" htmlFor="password">Create a password</label>
            <div className="relative">
              <input
                id="password"
                className="field pr-20"
                type={show ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
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
          </div>

          <div className="mt-stack-sm">
            <label className="label" htmlFor="confirm">Confirm password</label>
            <input
              id="confirm"
              className="field"
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Type it again"
            />
            {mismatch && (
              <p className="mt-1.5 text-label-md font-semibold text-error">
                Passwords do not match yet.
              </p>
            )}
          </div>

          {error && <ErrorNote>{error}</ErrorNote>}
        </form>
      </main>

      <footer className="safe-bottom sticky bottom-0 bg-background px-margin-mobile pt-2">
        <button
          type="submit"
          form="join-form"
          className="btn btn-primary btn-block btn-cta"
          disabled={busy || !ready}
        >
          {busy ? <Spinner /> : role === 'sponsor' ? 'Start sponsoring' : 'Start planting'}
        </button>
        <p className="mt-2.5 pb-1 text-center text-on-surface-variant">
          Already have an account?{' '}
          <Link to="/signin" className="font-semibold text-primary underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </footer>
    </div>
  )
}
