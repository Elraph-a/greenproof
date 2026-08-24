import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import { DEMO, demoTrees } from '../lib/demo'
import { Icon } from '../components/Icon'

export function Profile() {
  const { profile, session, signOut, userId } = useAuth()
  const [stats, setStats] = useState<{ trees: number; alive: number } | null>(null)

  useEffect(() => {
    if (!userId) return
    if (DEMO) {
      setStats({
        trees: demoTrees.length,
        alive: demoTrees.filter((t) => t.status === 'alive').length,
      })
      return
    }
    supabase
      .from('trees')
      .select('status')
      .eq('owner_id', userId)
      .then(({ data }) => {
        const rows = data ?? []
        setStats({
          trees: rows.length,
          alive: rows.filter((r) => r.status === 'alive').length,
        })
      })
  }, [userId])

  const survival =
    stats && stats.trees > 0 ? Math.round((stats.alive / stats.trees) * 100) : null

  return (
    <div className="px-margin-mobile pt-1 pb-2">
      <h1 className="font-headline text-headline-xl font-bold text-on-surface">
        {profile?.full_name?.split(' ')[0] ?? 'Profile'}
      </h1>
      <p className="mt-0.5 text-label-lg text-on-surface-variant capitalize">
        {profile?.role ?? 'planter'}
      </p>

      <div className="card mt-stack-sm">
        <div className="flex items-center gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
            <Icon name="person" size={28} />
          </span>
          <div className="min-w-0">
            <p className="truncate font-headline text-headline-md font-bold text-on-surface">
              {profile?.full_name || 'No name set'}
            </p>
            <p className="truncate text-on-surface-variant">{session?.user.email}</p>
            {profile?.phone && (
              <p className="truncate text-on-surface-variant">{profile.phone}</p>
            )}
          </div>
        </div>

        {profile?.story && (
          <p className="mt-stack-sm border-t border-outline-variant pt-stack-sm text-on-surface italic">
            “{profile.story}”
          </p>
        )}
      </div>

      <div className="mt-2.5 grid grid-cols-3 gap-2.5">
        <Tile icon="tree" label="Trees" value={stats ? String(stats.trees) : '-'} />
        <Tile icon="check" label="Alive" value={stats ? String(stats.alive) : '-'} tone="green" />
        <Tile
          icon="chart"
          label="Survival"
          value={survival === null ? '-' : `${survival}%`}
          tone="green"
        />
      </div>

      <Link to="/leaderboard" className="card mt-stack-sm flex items-center gap-3 active:bg-surface-container-low">
        <Icon name="trophy" size={24} className="text-primary" />
        <span className="flex-1 font-bold text-on-surface">Leaderboard</span>
        <Icon name="chevron-right" size={20} className="text-on-surface-variant" />
      </Link>

      <Link to="/map" className="card mt-2 flex items-center gap-3 active:bg-surface-container-low">
        <Icon name="map" size={24} className="text-primary" />
        <span className="flex-1 font-bold text-on-surface">Map</span>
        <Icon name="chevron-right" size={20} className="text-on-surface-variant" />
      </Link>

      {profile?.role === 'sponsor' ? (
        <Link to="/sponsor/full" className="card mt-2 flex items-center gap-3 active:bg-surface-container-low">
          <Icon name="chart" size={24} className="text-primary" />
          <span className="flex-1 font-bold text-on-surface">
            Full dashboard
            <span className="block text-label-md font-normal text-on-surface-variant">
              Wide view, better on a laptop
            </span>
          </span>
          <Icon name="chevron-right" size={20} className="text-on-surface-variant" />
        </Link>
      ) : (
        <Link to="/wallet" className="card mt-2 flex items-center gap-3 active:bg-surface-container-low">
          <Icon name="wallet" size={24} className="text-accent" />
          <span className="flex-1 font-bold text-on-surface">Wallet</span>
          <Icon name="chevron-right" size={20} className="text-on-surface-variant" />
        </Link>
      )}

      {profile?.role === 'reviewer' && (
        <Link to="/review" className="card mt-2 flex items-center gap-3 active:bg-surface-container-low">
          <Icon name="shield" size={24} className="text-primary" />
          <span className="flex-1 font-bold text-on-surface">Review queue</span>
          <Icon name="chevron-right" size={20} className="text-on-surface-variant" />
        </Link>
      )}

      <Link to="/profile/setup" className="btn btn-outline btn-block mt-stack-md">
        Edit details
      </Link>
      <button
        type="button"
        className="btn btn-ghost btn-block mt-2"
        onClick={() => void signOut()}
      >
        Sign out
      </button>
    </div>
  )
}

function Tile({
  icon,
  label,
  value,
  tone,
}: {
  icon: 'tree' | 'check' | 'chart'
  label: string
  value: string
  tone?: 'green'
}) {
  return (
    <div className="card p-3">
      <Icon
        name={icon}
        size={16}
        className={tone === 'green' ? 'text-[var(--color-verified)]' : 'text-on-surface-variant'}
      />
      <p className="tnum mt-1.5 font-headline text-headline-lg font-bold text-on-surface">
        {value}
      </p>
      <p className="mt-0.5 text-[10px] leading-[13px] text-on-surface-variant">{label}</p>
    </div>
  )
}
