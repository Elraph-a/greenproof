import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { loadPortfolio, type SponsorPortfolio } from '../lib/sponsor'
import { Icon } from '../components/Icon'
import { SurvivalCurve } from '../components/SurvivalCurve'
import {
  ErrorNote,
  HeroBadge,
  HeroCard,
  StatCell,
  StatStrip,
} from '../components/ui'

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
          <div className="skeleton h-40 rounded-xl" />
          <div className="grid grid-cols-2 gap-2.5">
            <div className="skeleton h-24 rounded-xl" />
            <div className="skeleton h-24 rounded-xl" />
          </div>
          <div className="skeleton h-16 rounded-xl" />
        </div>
      ) : (
        <>
          {/* Survival is the headline. Everything else supports it. */}
          <HeroCard
            label="Trees still alive"
            value={
              <>
                {p.alive}
                <span className="text-headline-xl font-semibold text-on-primary/60">
                  {' '}
                  of {p.trees}
                </span>
              </>
            }
            badge={
              <HeroBadge tone="good">{p.survivalPct.toFixed(0)}% survival</HeroBadge>
            }
            foot={
              p.flagged > 0 ? (
                <span className="text-label-lg">
                  {p.flagged} flagged and awaiting review
                </span>
              ) : undefined
            }
          >
            <div className="mt-3.5 h-1.5 overflow-hidden rounded-full bg-white/20">
              <div
                // scaleX, not width — see the same bar in MyGrove.
                className="h-full w-full origin-left rounded-full bg-inverse-primary transition-transform duration-500 ease-out"
                style={{ transform: `scaleX(${p.survivalPct / 100})` }}
              />
            </div>
          </HeroCard>

          {/* Cost per SURVIVING tree, committed and paid — three figures that
              belong together and were three separate cards. Pledged and paid
              stay distinct: collapsing them is the easiest place in this
              product to mislead someone. */}
          <div className="mt-2.5">
            <StatStrip>
              <StatCell
                label="Per living tree"
                value={`GH₵${p.costPerSurvivingGhs.toFixed(0)}`}
              />
              <StatCell label="Paid out" value={`GH₵${p.paidOutGhs.toFixed(0)}`} />
              <StatCell
                label="Pledged"
                tone="warn"
                value={`GH₵${p.committedGhs.toFixed(0)}`}
              />
            </StatStrip>
          </div>

          <Link to="/sponsor/fund" className="btn btn-primary btn-block mt-2.5">
            <Icon name="plus" size={19} />
            Fund more trees
          </Link>

          <details className="disclosure mt-2.5">
            <summary>What these figures mean</summary>
            <div className="disclosure-body">
              <strong className="text-on-surface">Per living tree</strong> is
              paid out ÷ trees still alive. Cost per tree <em>planted</em> is
              the number reforestation programmes usually quote, and it is the
              one that hides the failures.{' '}
              <strong className="text-on-surface">Paid out</strong> is money
              released against verified visits only.{' '}
              <strong className="text-on-surface">Pledged</strong> is what you
              committed - a pledge is not evidence a tree survived, which is why
              it is never added to the other two.
            </div>
          </details>

          <section className="card mt-stack-lg">
            <h2 className="font-headline text-headline-md font-bold text-on-surface">
              Survival over time
            </h2>
            <p className="mt-0.5 mb-3 text-label-lg text-on-surface-variant">
              Distinct trees confirmed alive at each round.
            </p>
            <SurvivalCurve points={p.curve} />
          </section>

          <section>
            <h2 className="section-h">Recently verified</h2>

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

