import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { createSponsorship } from '../lib/sponsor'
import {
  ESTABLISHMENT_GHS,
  PER_VISIT_GHS,
  VISITS_PER_YEAR,
  costPerTreeGhs,
  payments,
} from '../lib/payments'
import { Icon } from '../components/Icon'
import { ErrorNote, Spinner } from '../components/ui'

/**
 * Fund a grove.
 *
 * The pricing is shown broken down rather than as a single figure, because the
 * BREAKDOWN is the pitch: most of the money is paid after the tree has survived
 * a check, not on planting day. Paying up front is what makes plant-and-abandon
 * rational, and it is the failure mode of nearly every reforestation grant.
 *
 * Payment goes through `lib/payments`, which is currently a MOCK. It fails
 * about one call in twelve on purpose — a flow that has never rendered its own
 * failure state is a flow that will first render it in front of judges.
 */

const PRESETS = [5, 10, 25, 50]

export function FundGrove() {
  const { userId, profile } = useAuth()
  const navigate = useNavigate()

  const [trees, setTrees] = useState(10)
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ ref: string; trees: number; amount: number } | null>(null)

  const perTree = costPerTreeGhs()
  const total = trees * perTree

  async function pay() {
    if (!userId) return
    setBusy(true)
    setError(null)
    try {
      const res = await payments.collect({
        amountGhs: total,
        phone,
        reference: `grove-${Date.now()}`,
      })
      if (!res.ok) {
        setError(res.message)
        return
      }
      await createSponsorship(userId, trees, total)
      setDone({ ref: res.providerRef ?? res.reference, trees, amount: total })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete the payment')
    } finally {
      setBusy(false)
    }
  }

  /* ---- confirmation ------------------------------------------------- */
  if (done) {
    return (
      <Frame title="Funded" onClose={() => navigate('/sponsor')}>
        <div className="flex flex-col items-center pt-stack-lg text-center">
          <span className="flex size-[72px] items-center justify-center rounded-full bg-[var(--color-verified-container)] text-[var(--color-verified)]">
            <Icon name="check-circle" size={40} />
          </span>
          <h2 className="mt-stack-md font-headline text-headline-xl font-bold text-on-surface">
            {done.trees} trees funded
          </h2>
          <p className="mt-2 max-w-[290px] text-on-surface-variant">
            GH₵{done.amount.toFixed(2)} committed. Money reaches a planter only
            when a check-in on their tree passes verification.
          </p>
          <p className="tnum mt-3 text-label-md text-on-surface-variant">
            Reference {done.ref}
          </p>

          <div className="note-warn mt-stack-md text-left">
            <p className="text-label-lg">
              <strong>This was a mock payment.</strong> The MTN MoMo sandbox sits
              behind the same interface. See <code>src/lib/payments.ts</code>.
              No real money moved.
            </p>
          </div>
        </div>

        <button
          type="button"
          className="btn btn-primary btn-block mt-stack-lg"
          onClick={() => navigate('/sponsor')}
        >
          Back to my impact
        </button>
      </Frame>
    )
  }

  return (
    <Frame title="Fund a grove" onClose={() => navigate('/sponsor')}>
      <div className="card">
        <p className="font-headline text-headline-md font-bold text-on-surface">
          University of Ghana, Legon
        </p>
        <p className="mt-0.5 text-label-lg text-on-surface-variant">
          Campus perimeter planting · verified every 5 days
        </p>
      </div>

      <h3 className="mt-stack-md mb-2 text-label-lg font-semibold text-on-surface">
        How many trees?
      </h3>

      <div className="flex gap-2">
        {PRESETS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setTrees(n)}
            className={`pill flex-1 justify-center ${trees === n ? 'pill-on' : 'pill-off'}`}
          >
            {n}
          </button>
        ))}
      </div>

      <div className="mt-2.5 flex items-center gap-3">
        <button
          type="button"
          aria-label="Fewer trees"
          onClick={() => setTrees((t) => Math.max(1, t - 1))}
          className="flex size-11 items-center justify-center rounded-lg bg-surface-container text-on-surface"
        >
          <Icon name="x" size={14} />
        </button>
        <input
          aria-label="Number of trees"
          className="field-underline text-center"
          inputMode="numeric"
          value={trees}
          onChange={(e) => setTrees(Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1))}
        />
        <button
          type="button"
          aria-label="More trees"
          onClick={() => setTrees((t) => t + 1)}
          className="flex size-11 items-center justify-center rounded-lg bg-surface-container text-on-surface"
        >
          <Icon name="plus" size={16} />
        </button>
      </div>

      {/* The breakdown is the argument, not the total. */}
      <div className="card mt-stack-md">
        <span className="micro">What your money does</span>
        <dl className="mt-2.5 space-y-2 text-label-lg">
          <Line
            label="On establishment"
            sub="paid after the first verified check-in"
            value={`GH₵${(ESTABLISHMENT_GHS * trees).toFixed(2)}`}
          />
          <Line
            label={`On survival · ${VISITS_PER_YEAR - 1} later visits`}
            sub="paid only when the tree is confirmed alive"
            value={`GH₵${(PER_VISIT_GHS * (VISITS_PER_YEAR - 1) * trees).toFixed(2)}`}
          />
        </dl>
        <div className="mt-3 flex items-baseline justify-between border-t border-outline-variant pt-3">
          <span className="font-semibold text-on-surface">Total</span>
          <span className="tnum font-headline text-headline-lg font-bold text-accent">
            GH₵{total.toFixed(2)}
          </span>
        </div>
        <p className="mt-1.5 text-label-md text-on-surface-variant">
          GH₵{perTree.toFixed(2)} per tree for a year of monitoring. Nothing is
          released to a planter until a check-in passes verification.
        </p>
      </div>

      <div className="mt-stack-md">
        <label className="label" htmlFor="momo">Mobile Money number</label>
        <input
          id="momo"
          className="field"
          type="tel"
          inputMode="tel"
          placeholder="024 000 0000"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      <button
        type="button"
        className="btn btn-primary btn-block mt-stack-md"
        disabled={busy || phone.trim().length < 10}
        onClick={() => void pay()}
      >
        {busy ? <Spinner /> : `Pay GH₵${total.toFixed(2)} with MoMo`}
      </button>

      {/* Never let a mock look real. */}
      <p className="mt-2 text-center text-label-md text-on-surface-variant">
        {payments.name} · sandbox, no real money moves
      </p>
    </Frame>
  )
}

function Frame({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="safe-top sticky top-0 z-30 flex items-center gap-3 bg-background px-margin-mobile pt-3 pb-2.5">
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-container text-on-surface active:bg-surface-container-high"
        >
          <Icon name="arrow-left" size={18} />
        </button>
        <h1 className="font-headline text-headline-lg font-bold text-on-surface">
          {title}
        </h1>
      </header>
      <main className="flex-1 px-margin-mobile pb-stack-lg">{children}</main>
    </div>
  )
}

function Line({
  label,
  sub,
  value,
}: {
  label: string
  sub: string
  value: string
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <dt className="font-medium text-on-surface">{label}</dt>
        <dd className="text-label-md text-on-surface-variant">{sub}</dd>
      </div>
      <span className="tnum shrink-0 font-semibold text-on-surface">{value}</span>
    </div>
  )
}
