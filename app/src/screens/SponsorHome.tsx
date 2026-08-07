import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { loadPortfolio, type SponsorPortfolio } from '../lib/sponsor'
import { Icon } from '../components/Icon'
import { SurvivalCurve } from '../components/SurvivalCurve'
import { ErrorNote } from '../components/ui'

/**
 * The sponsor's home — in the app, on a phone, not a desktop dashboard.
 *
 * The order of the screen is the argument. Survival first, because that is what
 * was bought. Cost per SURVIVING tree next, because cost per tree planted is
 * the number every reforestation programme quotes and it is the one that hides
 * the failure. Then the photo wall, because a sponsor does not want a
 * certificate — they want to see the specific trees their money kept alive.
 *
 * "Committed" and "paid out" are shown as separate figures on purpose. A pledge
 * is not evidence a tree survived, and collapsing them would be the single
 * easiest place in this product to mislead someone.
 */
export function SponsorHome() {
  const { userId, profile } = useAuth()
  const [p, setP] = useState<SponsorPortfolio | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    loadPortfolio(userId)
      .then(setP)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load'))
  }, [userId])

  const today = new Date()

  return (
    <div className="px-margin-mobile pt-1 pb-2">
      <h1 className="font-headline text-headline-xl font-bold text-on-surface">
        {profile?.full_name ? profile.full_name.split(' ')[0] : 'Your impact'}
      </h1>
      <p className="mt-0.5 text-label-lg text-on-surface-variant">
        {today.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}{' '}
        · University of Ghana, Legon
      </p>

      {error && <ErrorNote>{error}</ErrorNote>}

      {!p ? (
        <div className="mt-stack-sm flex flex-col gap-2.5">
          {[0, 1].map((i) => (
            <div key={i} className="card h-24 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* Survival is the headline. Everything else supports it. */}
          <div className="card mt-stack-sm">
            <span className="micro">Trees still alive</span>
            <div className="mt-1.5 flex items-end gap-2">
              <p className="tnum font-headline text-display-lg font-bold text-on-surface">
                {p.alive}
              </p>
              <p className="tnum pb-2 text-headline-md text-on-surface-variant">
                of {p.trees}
              </p>
              <span className="mb-2.5 ml-auto">
                <span className="chip chip-verified tnum">
                  {p.survivalPct.toFixed(0)}% survival
                </span>
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-container-high">
              <div
                className="h-full rounded-full bg-[var(--color-verified)]"
                style={{ width: `${p.survivalPct}%` }}
              />
            </div>
            {p.flagged > 0 && (
              <p className="mt-2.5 flex items-center gap-1.5 text-label-lg text-on-surface-variant">
                <Icon name="warning" size={14} className="text-tertiary" />
                {p.flagged} flagged and awaiting review
              </p>
            )}
          </div>

          <div className="mt-2.5 grid grid-cols-2 gap-2.5">
            <MoneyCard
              label="Cost per surviving tree"
              value={`GH₵${p.costPerSurvivingGhs.toFixed(2)}`}
              note="paid out ÷ trees alive"
            />
            <MoneyCard
              label="Paid to planters"
              value={`GH₵${p.paidOutGhs.toFixed(2)}`}
              note="only on verified visits"
            />
          </div>

          {/* Pledged vs paid, deliberately not merged. */}
          <div className="card mt-2.5 flex items-center gap-3 py-3">
            <Icon name="wallet" size={17} className="shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-on-surface">You have committed</p>
              <p className="text-label-md text-on-surface-variant">
                {p.committedTrees} trees · a pledge, not yet proof of survival
              </p>
            </div>
            <p className="tnum shrink-0 font-headline text-headline-md font-bold text-accent">
              GH₵{p.committedGhs.toFixed(0)}
            </p>
          </div>

          <Link to="/sponsor/fund" className="btn btn-primary btn-block mt-2.5">
            <Icon name="plus" size={19} />
            Fund more trees
          </Link>

          <section className="card mt-stack-md">
            <h2 className="font-headline text-headline-md font-bold text-on-surface">
              Survival over time
            </h2>
            <p className="mt-0.5 mb-3 text-label-lg text-on-surface-variant">
              Distinct trees confirmed alive at each round.
            </p>
            <SurvivalCurve points={p.curve} />
          </section>

          <section className="mt-stack-md">
            <h2 className="font-headline text-headline-md font-bold text-on-surface">
              Recently verified
            </h2>
            <p className="mt-0.5 mb-2.5 text-label-lg text-on-surface-variant">
              Every photo here passed the checks. Nothing on this wall was
              approved by the person who submitted it.
            </p>

            {p.recent.length === 0 ? (
              <div className="card">
                <p className="text-on-surface-variant">No verified check-ins yet.</p>
              </div>
            ) : (
              <ul className="grid grid-cols-3 gap-2">
                {p.recent.map((r) => (
                  <li key={r.id}>
                    <Link to={`/tree/${r.treeId}`} className="block">
                      <div className="aspect-square overflow-hidden rounded-lg bg-surface-container-high">
                        {r.url && (
                          <img
                            src={r.url}
                            alt=""
                            loading="lazy"
                            className="size-full object-cover"
                          />
                        )}
                      </div>
                      <p className="tnum mt-1 text-label-md text-on-surface-variant">
                        {new Date(r.capturedAt).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                        })}
                        {r.confidence !== null && ` · ${r.confidence}%`}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function MoneyCard({
  label,
  value,
  note,
}: {
  label: string
  value: string
  note: string
}) {
  return (
    <div className="card p-3.5">
      <span className="micro">{label}</span>
      <p className="tnum mt-1.5 font-headline text-headline-lg font-bold text-on-surface">
        {value}
      </p>
      <p className="mt-0.5 text-label-md leading-tight text-on-surface-variant">
        {note}
      </p>
    </div>
  )
}
