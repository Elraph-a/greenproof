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

      {/*
        TWO THINGS CHANGED HERE AND BOTH WERE MEANING, NOT DECORATION.

        The podium used the AMBER ACCENT. Amber means money in this app and
        nothing else - that rule is what lets a planter read a cedi figure
        without reading the label. Spending it on "you came third" quietly
        broke the one colour convention the product actually enforces. Rank now
        reads through the rank number itself, which is what a rank is.

        And the medals were emoji. Emoji render as a different typeface at a
        different weight on every Android in the field, so the first three rows
        used a font nothing else on the screen uses. A filled rank chip is the
        same type as the rest of the app and scales with it.
      */}
      <ol className="rise-stagger flex flex-col gap-2.5">
        {sorted.map((r, i) => (
          <li key={r.id} className="card flex items-center gap-3">
            <span
              className={`flex size-8 shrink-0 items-center justify-center rounded-full font-headline text-label-lg font-bold ${
                i < 3
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-high text-on-surface-variant'
              }`}
            >
              {i + 1}
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
          planted. Planting is the easy part. A leaderboard that rewarded
          volume would work against the whole product.
        </p>
      </div>
    </div>
  )
}
