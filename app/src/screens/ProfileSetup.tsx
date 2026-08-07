import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { Icon } from '../components/Icon'
import { ErrorNote, Spinner } from '../components/ui'

/**
 * Profile setup, now carrying the role choice.
 *
 * WHY THE ROLE IS PICKED HERE and not inferred: the two users want opposite
 * things from the first screen. A planter wants the camera; a sponsor wants
 * evidence. Guessing wrong costs the sponsor the entire point of the product,
 * and there is no signal at sign-up that would let us guess.
 *
 * The choice is written through `set_my_role`, a SECURITY DEFINER function that
 * accepts only 'planter' or 'sponsor'. `profiles.role` itself is not writable
 * by a client — otherwise anyone could promote themselves to 'reviewer' and
 * approve their own check-ins. See migration 0009.
 */
export function ProfileSetup() {
  const { profile, saveProfile, setRole } = useAuth()
  const navigate = useNavigate()

  const [role, setLocalRole] = useState<'planter' | 'sponsor'>(
    profile?.role === 'sponsor' ? 'sponsor' : 'planter',
  )
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [story, setStory] = useState(profile?.story ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await saveProfile({
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        story: story.trim() || null,
      })
      await setRole(role)
      navigate(role === 'sponsor' ? '/sponsor' : '/grove', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="safe-top sticky top-0 z-30 flex items-center gap-3 bg-background px-margin-mobile pt-3 pb-2.5">
        <button
          type="button"
          aria-label="Go back"
          onClick={() => navigate(-1)}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-container text-on-surface"
        >
          <Icon name="arrow-left" size={18} />
        </button>
        <h1 className="font-headline text-headline-lg font-bold text-on-surface">
          Your details
        </h1>
      </header>

      <main className="flex-1 px-margin-mobile pb-3">
        <form id="profile-form" onSubmit={submit}>
          <h2 className="mb-2 text-label-lg font-semibold text-on-surface">
            How will you use GreenProof?
          </h2>

          <div className="flex flex-col gap-2.5">
            <RoleCard
              icon="tree"
              title="I want to plant trees"
              body="Register the trees you plant, check in on them, and earn for every one that survives."
              selected={role === 'planter'}
              onSelect={() => setLocalRole('planter')}
            />
            <RoleCard
              icon="wallet"
              title="I want to sponsor trees"
              body="Fund trees and see verified proof they are still alive — with the photos and the survival rate."
              selected={role === 'sponsor'}
              onSelect={() => setLocalRole('sponsor')}
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

          {role === 'planter' && (
            <div className="mt-stack-sm">
              <label className="label" htmlFor="story">
                Your story{' '}
                <span className="font-normal text-on-surface-variant">(optional)</span>
              </label>
              <textarea
                id="story"
                className="field py-3"
                rows={3}
                maxLength={280}
                placeholder="One sentence about why you're planting."
                value={story}
                onChange={(e) => setStory(e.target.value)}
              />
              <p className="mt-1.5 text-label-md text-on-surface-variant">
                Shown to the sponsors funding your trees.
              </p>
            </div>
          )}

          {error && <ErrorNote>{error}</ErrorNote>}
        </form>
      </main>

      <footer className="safe-bottom sticky bottom-0 bg-background px-margin-mobile pt-2">
        <button
          type="submit"
          form="profile-form"
          className="btn btn-primary btn-block"
          disabled={busy || fullName.trim().length === 0}
        >
          {busy ? <Spinner /> : 'Save and continue'}
        </button>
      </footer>
    </div>
  )
}

function RoleCard({
  icon,
  title,
  body,
  selected,
  onSelect,
}: {
  icon: 'tree' | 'wallet'
  title: string
  body: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`card flex gap-3 text-left transition-shadow ${
        selected ? 'ring-2 ring-primary' : ''
      }`}
    >
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${
          selected
            ? 'bg-primary text-on-primary'
            : 'bg-surface-container text-on-surface-variant'
        }`}
      >
        <Icon name={icon} size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-headline text-headline-md font-bold text-on-surface">
          {title}
        </span>
        <span className="mt-0.5 block text-label-lg text-on-surface-variant">
          {body}
        </span>
      </span>
      <span
        className={`mt-1 flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${
          selected ? 'border-primary bg-primary text-on-primary' : 'border-outline-variant'
        }`}
      >
        {selected && <Icon name="check" size={11} />}
      </span>
    </button>
  )
}
