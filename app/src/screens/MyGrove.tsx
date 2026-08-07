import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { photoUrls } from '../lib/photos'
import {
  formatAge,
  listMyTrees,
  nextCheckinDue,
  treeLabel,
  type TreeWithLatest,
} from '../lib/trees'
import { supabase } from '../lib/supabase'
import { DEMO, demoCommonName, demoEarnings, demoLedger } from '../lib/demo'
import { Icon } from '../components/Icon'
import { EmptyState, ErrorNote, StatusChip } from '../components/ui'

/**
 * My Grove — built to docs/design/v2/01-my-grove.png.
 *
 * Structure, top to bottom: a dated greeting, three stat cards, a survival bar,
 * filter pills, then the tree list. The date header is not decoration — during
 * a check-in round the question "did I already do these today?" is the most
 * common one, and the answer is the first thing on the screen.
 */

type Filter = 'all' | 'verified' | 'review' | 'flagged'

export function MyGrove() {
  const { userId, profile } = useAuth()
  const [trees, setTrees] = useState<TreeWithLatest[] | null>(null)
  const [thumbs, setThumbs] = useState<Map<string, string>>(new Map())
  const [balance, setBalance] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')

  const load = useCallback(async () => {
    if (!userId) return
    try {
      const rows = await listMyTrees(userId)
      setTrees(rows)
      const paths = rows
        .map((t) => t.latest?.wide_photo)
        .filter((p): p is string => Boolean(p))
      if (paths.length) setThumbs(await photoUrls(paths))

      if (DEMO) {
        setBalance(demoLedger.reduce((s, e) => s + Number(e.amount_ghs), 0))
        return
      }
      const { data } = await supabase
        .from('ledger_entries')
        .select('amount_ghs')
        .eq('user_id', userId)
      setBalance(
        (data ?? []).reduce((s, e) => s + Number(e.amount_ghs ?? 0), 0),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your trees')
    }
  }, [userId])

  useEffect(() => {
    void load()
    // Trees appear once the offline queue drains, so re-poll while visible.
    const t = window.setInterval(() => void load(), 15_000)
    return () => window.clearInterval(t)
  }, [load])

  const counts = useMemo(() => {
    const list = trees ?? []
    return {
      all: list.length,
      verified: list.filter((t) => t.latest?.verdict === 'verified').length,
      review: list.filter((t) => t.latest?.verdict === 'review').length,
      flagged: list.filter((t) => t.latest?.verdict === 'flagged').length,
    }
  }, [trees])

  const shown = useMemo(() => {
    const list = trees ?? []
    if (filter === 'all') return list
    return list.filter((t) => t.latest?.verdict === filter)
  }, [trees, filter])

  const alive = trees?.filter((t) => t.status === 'alive').length ?? 0
  const survival = trees && trees.length ? Math.round((alive / trees.length) * 100) : 0

  const today = new Date()
  /*
   * The hero used to be the weekday — the biggest text on the home screen said
   * "Friday", which reads as a template. It now greets the person, matching
   * SponsorHome; the full date stays as the eyebrow because "did I already do
   * these today?" is still the most common check-in-round question.
   */
  const hour = today.getHours()
  const greeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = profile?.full_name?.trim().split(/\s+/)[0]

  return (
    <div className="px-margin-mobile pt-1 pb-2">
      {/* Dated greeting */}
      <p className="text-label-lg text-on-surface-variant">
        {today.toLocaleDateString('en-GB', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })}
      </p>
      <h1 className="mt-0.5 font-headline text-headline-xl font-bold text-on-surface">
        {firstName ? `${greeting}, ${firstName}` : greeting}
      </h1>

      {error && <ErrorNote>{error}</ErrorNote>}

      {/* Three stat cards. Amber is money and only money. */}
      <div className="mt-stack-sm grid grid-cols-3 gap-2.5">
        <StatCard
          icon="tree"
          tone="green"
          value={trees ? String(trees.length) : '—'}
          label="Trees planted"
        />
        <StatCard
          icon="check"
          tone="green"
          value={trees ? String(alive) : '—'}
          label="Confirmed alive"
        />
        <StatCard
          icon="wallet"
          tone="amber"
          value={balance === null ? '—' : `GH₵${balance.toFixed(0)}`}
          label="Earned"
        />
      </div>

      {/* Survival rate */}
      <div className="card mt-2.5 flex items-center gap-3 py-3">
        <Icon name="chart" size={18} className="shrink-0 text-on-surface-variant" />
        <span className="shrink-0 font-semibold text-on-surface">Survival rate</span>
        <span className="tnum ml-auto shrink-0 font-headline font-bold text-on-surface">
          {trees ? `${survival}%` : '—'}
        </span>
        <div className="h-2 w-16 shrink-0 overflow-hidden rounded-full bg-surface-container-high">
          <div
            className="h-full rounded-full bg-[var(--color-verified)]"
            style={{ width: `${survival}%` }}
          />
        </div>
      </div>

      <h2 className="mt-stack-md mb-2.5 font-headline text-headline-lg font-bold text-on-surface">
        Your Trees
      </h2>

      {/* Filter pills — the counts are the point. A planter with one flagged
          tree needs to find it without scrolling forty cards. */}
      <div className="-mx-margin-mobile mb-3 flex gap-2 overflow-x-auto px-margin-mobile pb-1">
        <FilterPill f="all" cur={filter} set={setFilter} n={counts.all}>All</FilterPill>
        <FilterPill f="verified" cur={filter} set={setFilter} n={counts.verified}>Verified</FilterPill>
        <FilterPill f="review" cur={filter} set={setFilter} n={counts.review}>Review</FilterPill>
        <FilterPill f="flagged" cur={filter} set={setFilter} n={counts.flagged}>Flagged</FilterPill>
      </div>

      {!trees && !error && (
        <div className="flex flex-col gap-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card flex animate-pulse gap-3">
              <div className="size-[68px] shrink-0 rounded-lg bg-surface-container-high" />
              <div className="flex-1 space-y-2 py-1">
                <div className="h-4 w-1/2 rounded bg-surface-container-high" />
                <div className="h-3 w-1/3 rounded bg-surface-container-high" />
              </div>
            </div>
          ))}
        </div>
      )}

      {trees?.length === 0 && (
        <EmptyState
          title="No trees yet"
          body={`Register your first tree${profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}, and start proving it lives.`}
          action={
            <Link to="/register" className="btn btn-primary btn-fab">
              <Icon name="plus" size={20} />
              Register a tree
            </Link>
          }
        />
      )}

      {trees && trees.length > 0 && shown.length === 0 && (
        <p className="py-stack-lg text-center text-on-surface-variant">
          No trees in this filter.
        </p>
      )}

      <div className="flex flex-col gap-2.5">
        {shown.map((tree) => {
          const thumb = tree.latest ? thumbs.get(tree.latest.wide_photo) : undefined
          const due = tree.latest ? nextCheckinDue(tree.latest.captured_at) : null
          const earned = demoEarnings.get(tree.id)
          const name = demoCommonName.get(tree.id) ?? treeLabel(tree)
          return (
            <Link
              key={tree.id}
              to={`/tree/${tree.id}`}
              className="card relative flex gap-3 active:bg-surface-container-low"
            >
              <div className="size-[68px] shrink-0 overflow-hidden rounded-lg bg-surface-container-high">
                {thumb ? (
                  <img src={thumb} alt="" loading="lazy" className="size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center text-on-surface-variant">
                    <Icon name="image" size={22} />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="truncate font-headline text-headline-md font-bold text-on-surface">
                    {name}
                  </h3>
                  <StatusChip status={tree.latest?.verdict ?? 'pending'} />
                </div>

                <p className="truncate text-label-lg text-on-surface-variant italic">
                  {tree.species || 'Species not recorded'}
                </p>

                <div className="mt-1.5 flex items-center gap-1 text-on-surface-variant">
                  <Icon name={due?.overdue ? 'warning' : 'calendar'} size={14} />
                  <span className={`text-label-lg ${due?.overdue ? 'text-error' : ''}`}>
                    {due ? due.label : `Registered ${formatAge(tree.created_at)} ago`}
                  </span>
                </div>

                {earned !== undefined && earned > 0 && (
                  <span className="chip chip-money tnum mt-2">GH₵{earned}</span>
                )}
                {tree.tag_code && (
                  <span className="ml-1.5 text-label-md text-on-surface-variant">
                    {tree.tag_code}
                  </span>
                )}
              </div>

              {/* Per-card check-in shortcut. During a round the user is walking
                  tree to tree, and going home → check-in → pick the tree again
                  is three taps for something they already have in front of them. */}
              <span
                className="absolute right-3 bottom-3 flex size-9 items-center justify-center rounded-lg bg-primary text-on-primary"
                aria-hidden
              >
                <Icon name="camera" size={17} />
              </span>
            </Link>
          )
        })}
      </div>

      {trees && trees.length > 0 && (
        <Link
          to="/register"
          className="btn btn-primary btn-fab fixed right-margin-mobile bottom-[104px] z-40"
        >
          <Icon name="plus" size={20} />
          Register Tree
        </Link>
      )}
    </div>
  )
}

function StatCard({
  icon,
  value,
  label,
  tone,
}: {
  icon: 'tree' | 'check' | 'wallet'
  value: string
  label: string
  tone: 'green' | 'amber'
}) {
  return (
    <div className="card p-3">
      <Icon
        name={icon}
        size={17}
        className={tone === 'amber' ? 'text-accent' : 'text-[var(--color-verified)]'}
      />
      <p className="tnum mt-1.5 font-headline text-headline-lg font-bold text-on-surface">
        {value}
      </p>
      {/* 10px so "Confirmed alive" and "Trees planted" each hold one line at
          390px — wrapping made the three cards different heights. */}
      <p className="mt-0.5 text-[10px] leading-[13px] text-on-surface-variant">
        {label}
      </p>
    </div>
  )
}

function FilterPill({
  f,
  cur,
  set,
  n,
  children,
}: {
  f: Filter
  cur: Filter
  set: (f: Filter) => void
  n: number
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={() => set(f)}
      className={`pill ${cur === f ? 'pill-on' : 'pill-off'}`}
    >
      {children} ({n})
    </button>
  )
}
