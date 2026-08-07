import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { Icon, type IconName } from './Icon'

/**
 * App chrome — built to docs/design/v2.
 *
 * A five-item bottom bar sitting flush on white, with the active item marked by
 * colour AND a dot beneath the label. Deliberately not the floating pill of the
 * previous version: the reference screens keep the bar quiet so the white cards
 * stay the loudest thing on screen.
 *
 * Colour alone is not enough for the active state — at arm's length in sunlight
 * a shift between two greens is invisible, but a shape appearing is not.
 */

type Tab = { to: string; label: string; icon: IconName }

/**
 * Two different products share one shell.
 *
 * A planter's tabs are verbs — register, check in. A sponsor never does either;
 * their tabs are evidence. Showing a sponsor a camera button would be the
 * clearest possible signal that we had not thought about them.
 */
const PLANTER_TABS: Tab[] = [
  { to: '/grove', label: 'My Grove', icon: 'tree' },
  { to: '/register', label: 'Register', icon: 'plus' },
  { to: '/checkin', label: 'Check-in', icon: 'camera' },
  { to: '/leaderboard', label: 'Board', icon: 'list' },
  { to: '/profile', label: 'More', icon: 'dots' },
]

const SPONSOR_TABS: Tab[] = [
  { to: '/sponsor', label: 'Impact', icon: 'chart' },
  { to: '/sponsor/fund', label: 'Fund', icon: 'plus' },
  { to: '/map', label: 'Map', icon: 'map' },
  { to: '/leaderboard', label: 'Board', icon: 'list' },
  { to: '/profile', label: 'More', icon: 'dots' },
]

export function TopBar({ children }: { children?: React.ReactNode }) {
  return (
    <header className="safe-top fixed top-0 z-50 flex h-[60px] w-full items-center justify-between bg-background/90 px-margin-mobile backdrop-blur-md">
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-on-primary">
          <Icon name="tree" size={18} />
        </span>
        <span className="font-headline text-headline-md font-bold text-on-surface">
          GreenProof
        </span>
      </div>
      {children}
    </header>
  )
}

export function Shell() {
  const { profile } = useAuth()
  const isSponsor = profile?.role === 'sponsor'
  const tabs = isSponsor ? SPONSOR_TABS : PLANTER_TABS

  return (
    <div className="min-h-dvh pt-[60px] pb-[92px]">
      <TopBar>
        {isSponsor && (
          <span className="chip chip-verified">
            <Icon name="wallet" size={12} />
            Sponsor
          </span>
        )}
      </TopBar>

      <Outlet />

      <nav className="safe-bottom fixed bottom-0 z-50 flex w-full items-stretch justify-around border-t border-outline-variant bg-surface-container-lowest px-1 pt-1.5">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.to === '/sponsor'}
            className={({ isActive }) =>
              `flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 rounded-lg transition-colors active:scale-95 ${
                isActive ? 'text-primary' : 'text-on-surface-variant'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon name={t.icon} size={21} />
                <span className={`text-micro ${isActive ? 'font-bold' : 'font-medium'}`}>
                  {t.label}
                </span>
                <span
                  className={`size-1 rounded-full ${isActive ? 'bg-primary' : 'bg-transparent'}`}
                  aria-hidden
                />
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
