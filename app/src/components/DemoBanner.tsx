import { DEMO } from '../lib/demo'

/**
 * A loud, permanent marker that the app is showing seeded data.
 *
 * WHY THIS EXISTS AND WHY IT IS UGLY
 * `VITE_DEMO=1` makes the app read fixtures and refuse every write. If that
 * ever reached production, a planter would register forty trees into a function
 * that throws, and the failure would look like a network problem rather than a
 * misconfiguration. That is the worst class of bug this project can have: it
 * costs field work that cannot be repeated.
 *
 * The banner is deliberately not styled to fit in. It is meant to be the first
 * thing anyone notices, including on a phone in a field.
 *
 * It is NOT a substitute for setting `VITE_DEMO=0` in Vercel - it is the alarm
 * for when someone forgets.
 */
export function DemoBanner() {
  if (!DEMO) return null

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 bg-[#b3261e] px-3 py-1 text-center text-[11px] font-bold tracking-wide text-white"
    >
      DEMO DATA. Nothing is saved. Set VITE_DEMO=0 for real use.
    </div>
  )
}
