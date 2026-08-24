import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { photoUrls } from '../lib/photos'
import { Icon } from '../components/Icon'
import { SurvivalCurve, type SurvivalPoint } from '../components/SurvivalCurve'
import { ErrorNote, Spinner } from '../components/ui'

/**
 * The sponsor's view. A DIFFERENT USER from everyone else in the app: an office
 * worker on a laptop, not a farmer on a phone - so this is the one screen
 * designed wide-first.
 *
 * The Stitch export stopped at the stat cards ("complex charts, maps and photo
 * grids omitted"), so the survival curve and the photo wall are built here. The
 * photo wall is the part that actually sells: a sponsor does not want a
 * certificate, they want to see the specific trees their money kept alive, with
 * the name of the person who planted them.
 */

interface Row {
  id: string
  status: string
  created_at: string
  current_confidence: number | null
}

interface RecentCheckin {
  id: string
  wide_photo: string
  captured_at: string
  confidence: number | null
  tree_id: string
}

/** Establishment GH₵5 + GH₵2 per later verified visit - see migration 0007. */
const ESTABLISHMENT_GHS = 5

export function SponsorDashboard() {
  const [trees, setTrees] = useState<Row[] | null>(null)
  const [curve, setCurve] = useState<SurvivalPoint[]>([])
  const [recent, setRecent] = useState<RecentCheckin[]>([])
  const [urls, setUrls] = useState<Map<string, string>>(new Map())
  const [invested, setInvested] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const [{ data: t, error: te }, { data: c }, { data: led }] =
          await Promise.all([
            supabase.from('trees').select('id, status, created_at, current_confidence'),
            supabase
              .from('checkins')
              .select('id, tree_id, wide_photo, captured_at, confidence, verdict')
              .eq('verdict', 'verified')
              .order('captured_at', { ascending: false })
              .limit(200),
            supabase.from('ledger_entries').select('amount_ghs'),
          ])

        if (te) throw new Error(te.message)
        setTrees((t ?? []) as unknown as Row[])
        setInvested(
          (led ?? []).reduce((s, e) => s + Number(e.amount_ghs ?? 0), 0),
        )

        const checkins = (c ?? []) as unknown as (RecentCheckin & { verdict: string })[]

        // Survival curve: group verified check-ins by day, and count how many
        // DISTINCT trees were confirmed alive on each round.
        const byDay = new Map<string, Set<string>>()
        for (const row of checkins) {
          const day = row.captured_at.slice(0, 10)
          if (!byDay.has(day)) byDay.set(day, new Set())
          byDay.get(day)!.add(row.tree_id)
        }
        const total = (t ?? []).length
        setCurve(
          [...byDay.entries()]
            .map(([date, set]) => ({ date, alive: set.size, total }))
            .sort((a, b) => a.date.localeCompare(b.date)),
        )

        const top = checkins.slice(0, 12)
        setRecent(top)
        if (top.length) setUrls(await photoUrls(top.map((r) => r.wide_photo)))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load the dashboard')
      }
    })()
  }, [])

  if (error) {
    return (
      <div className="mx-auto max-w-6xl p-margin-mobile">
        <ErrorNote>{error}</ErrorNote>
      </div>
    )
  }

  if (!trees) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-primary">
        <Spinner className="size-8" />
      </div>
    )
  }

  const alive = trees.filter((t) => t.status === 'alive').length
  const survival = trees.length ? (alive / trees.length) * 100 : 0
  const costPerSurviving = alive ? invested / alive : 0

  return (
    <div className="min-h-dvh bg-background">
      <header className="bg-surface">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-margin-mobile py-4">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary-container text-on-primary-container">
            <Icon name="tree" size={20} />
          </span>
          <span className="font-headline text-headline-md font-bold text-on-surface">
            GreenProof
          </span>
          <span className="text-on-surface-variant">· Sponsor</span>
          <Link to="/grove" className="btn btn-ghost ml-auto px-4">
            Back to the app
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-margin-mobile py-stack-md">
        <h1 className="mb-stack-md font-headline text-headline-xl font-bold text-on-surface">
          Impact dashboard
        </h1>

        <div className="grid grid-cols-2 gap-stack-sm lg:grid-cols-4">
          <StatCard label="Trees funded" value={String(trees.length)} />
          <StatCard
            label="Still alive"
            value={`${survival.toFixed(1)}%`}
            note={`${alive} of ${trees.length}`}
          />
          <StatCard
            label="Cost per surviving tree"
            value={`GH₵${costPerSurviving.toFixed(2)}`}
            note="paid out ÷ trees alive"
          />
          <StatCard label="Total invested" value={`GH₵${invested.toFixed(2)}`} />
        </div>

        <section className="card mt-stack-md">
          <h2 className="mb-1 font-headline text-headline-md font-bold text-on-surface">
            Survival over time
          </h2>
          <p className="mb-stack-sm text-on-surface-variant">
            Distinct trees confirmed alive at each check-in round.
          </p>
          <SurvivalCurve points={curve} />
        </section>

        <section className="card mt-stack-md">
          <h2 className="mb-1 font-headline text-headline-md font-bold text-on-surface">
            Recently verified
          </h2>
          <p className="mb-stack-sm text-on-surface-variant">
            Every photo here passed the four checks. Nothing on this wall was
            approved by the person who submitted it.
          </p>

          {recent.length === 0 ? (
            <p className="py-6 text-center text-on-surface-variant">
              No verified check-ins yet.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {recent.map((r) => (
                <li key={r.id}>
                  <Link to={`/tree/${r.tree_id}`} className="block">
                    <div className="aspect-square overflow-hidden rounded-xl bg-surface-container-high">
                      {urls.get(r.wide_photo) && (
                        <img
                          src={urls.get(r.wide_photo)}
                          alt=""
                          loading="lazy"
                          className="size-full object-cover"
                        />
                      )}
                    </div>
                    <p className="mt-1 text-label-md text-on-surface-variant">
                      {new Date(r.captured_at).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                      })}
                      {r.confidence !== null && ` · ${r.confidence}/100`}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* The honest footnote. A sponsor dashboard that quietly implies
            certainty is the thing this whole project exists to argue against. */}
        <p className="mt-stack-md text-label-lg text-on-surface-variant">
          Establishment payments are GH₵{ESTABLISHMENT_GHS.toFixed(2)} per tree and
          GH₵2.00 per later verified visit. Survival is measured from photo
          check-ins, not from satellite: Sentinel-2 is 10 m per pixel and cannot
          resolve an individual young tree. Grove-level greening is reported
          separately and never folded into a per-tree score.
        </p>
      </main>
    </div>
  )
}

function StatCard({
  label,
  value,
  note,
}: {
  label: string
  value: string
  note?: string
}) {
  return (
    <div className="card">
      <span className="micro">{label}</span>
      <p className="tnum mt-2 font-headline text-display-md font-bold text-on-surface">
        {value}
      </p>
      {note && <p className="mt-1 text-label-lg text-on-surface-variant">{note}</p>}
    </div>
  )
}
