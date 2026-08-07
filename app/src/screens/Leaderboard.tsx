import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { DEMO, demoLeaderboard } from '../lib/demo'
import { Icon } from '../components/Icon'
import { EmptyState, ErrorNote } from '../components/ui'
import type { LeaderboardRow } from '../lib/types'

/**
 * Schools, churches and communities ranked.
 *
 * Promised in the submitted description, and the cheapest growth mechanism in
 * the product: one church recruits its whole congregation for free.
 *
 * The default sort is SURVIVAL RATE, not tree count — deliberately. Ranking by
 * volume rewards planting and ignores keeping alive, which is the exact failure
 * this project exists to fix. A leaderboard sorted by trees planted would push
 * users toward the behaviour we are trying to price out.
 */
export function Leaderboard() {
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null)
  const [sort, setSort] = useState<'survival' | 'trees'>('survival')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (DEMO) {
      setRows(demoLeaderboard)
      return
    }
    supabase
      .from('group_leaderboard')
      .select('*')
      .then(({ data, error: e }) => {
        if (e) setError(e.message)
        else setRows((data ?? []) as unknown as LeaderboardRow[])
      })
  }, [])

  const sorted = useMemo(() => {
    const list = [...(rows ?? [])].filter((r) => r.trees > 0)
    return sort === 'survival'
      ? list.sort(
          (a, b) => (b.survival_pct ?? 0) - (a.survival_pct ?? 0) || b.trees - a.trees,
        )
      : list.sort((a, b) => b.trees - a.trees)
  }, [rows, sort])

  const medals = ['🥇', '🥈', '🥉']

  return (
    <div className="px-margin-mobile pt-1 pb-2">
      <h1 className="font-headline text-headline-xl font-bold text-on-surface">
        Leaderboard
      </h1>
      <p className="mt-0.5 text-label-lg text-on-surface-variant">
        Schools, churches and communities
      </p>

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="mt-stack-sm mb-3 flex gap-2">
        <button
          type="button"
          onClick={() => setSort('survival')}
          className={`pill ${sort === 'survival' ? 'pill-on' : 'pill-off'}`}
        >
          Best survival rate
        </button>
        <button
          type="button"
          onClick={() => setSort('trees')}
          className={`pill ${sort === 'trees' ? 'pill-on' : 'pill-off'}`}
        >
          Most trees
        </button>
      </div>

      {rows && sorted.length === 0 && (
        <EmptyState
          title="No groups yet"
          body="Groups appear here once their members have registered trees."
        />
      )}

      <ol className="flex flex-col gap-2.5">
        {sorted.map((r, i) => (
          <li
            key={r.id}
            /* The podium is marked with the gold accent rather than a heavier
               border — a thicker outline reads as "selected", not "winning". */
            className={`card flex items-center gap-3 ${
              i < 3 ? 'ring-1 ring-[var(--color-accent)]/45' : ''
            }`}
          >
            <span className="w-8 shrink-0 text-center font-headline text-headline-md font-bold text-on-surface">
              {medals[i] ?? i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-on-surface">{r.name}</p>
              <p className="text-label-lg text-on-surface-variant capitalize">
                {r.kind}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="tnum font-headline text-headline-md font-bold text-[var(--color-verified)]">
                {r.survival_pct ?? 0}%
              </p>
              <p className="text-label-lg text-on-surface-variant">
                {r.alive}/{r.trees} alive
              </p>
            </div>
          </li>
        ))}
      </ol>

      <div className="note mt-stack-md flex gap-2.5">
        <Icon name="trophy" size={16} className="mt-0.5 shrink-0 text-on-surface-variant" />
        <p className="text-label-lg text-on-surface-variant">
          Ranked by the share of trees still alive, not by how many were
          planted. Planting is the easy part — a leaderboard that rewarded
          volume would work against the whole product.
        </p>
      </div>
    </div>
  )
}
