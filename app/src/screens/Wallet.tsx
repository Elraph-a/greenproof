import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { Icon } from '../components/Icon'
import { EmptyState, ErrorNote, HeroCard } from '../components/ui'
import {
  CREDITS_PER_TREE,
  MIN_WITHDRAWAL,
  loadCredits,
  redeemForTrees,
  type CreditBalance,
} from '../lib/credits'
import { PILOT_PLOT_ID } from '../lib/sponsor'

/**
 * Earnings.
 *
 * The balance is derived from ledger_entries, which NO client can write —
 * `authenticated` has select only, and rows are inserted solely by the
 * `accrue_on_verified` trigger when a check-in reaches 'verified'.
 *
 * That is the sentence worth saying on stage: **you cannot pay yourself.** The
 * only route to money is passing verification, and verification is the one thing
 * the client also cannot touch. Two independent locks, both in the database.
 */

/**
 * Ledger status, in words a planter uses.
 *
 * The raw column value was being printed straight to the screen, so the app
 * told people their money was "accrued" - a database enum, in an app whose
 * entire subject is being paid. Anything unrecognised falls back to a plain
 * word rather than leaking the next enum we add.
 */
const LEDGER_STATUS: Record<string, string> = {
  accrued: 'Not yet paid',
  paid: 'Paid out',
  pending: 'Pending',
  reversed: 'Reversed',
}

export function Wallet() {
  const { userId } = useAuth()
  const [credits, setCredits] = useState<CreditBalance | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [payoutNote, setPayoutNote] = useState(false)
  const [redeeming, setRedeeming] = useState(false)
  const [redeemTrees, setRedeemTrees] = useState(1)
  const [redeemed, setRedeemed] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(() => {
    if (!userId) return
    loadCredits(userId)
      .then(setCredits)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load credits'))
  }, [userId])

  useEffect(refresh, [refresh])

  const entries = credits?.entries ?? null
  const available = credits?.available ?? 0
  const total = credits?.earned ?? 0
  const paid = credits?.cashedOut ?? 0
  const spent = credits?.redeemed ?? 0
  const affordable = Math.floor(available / CREDITS_PER_TREE)

  async function doRedeem() {
    if (!userId) return
    setBusy(true)
    setError(null)
    try {
      const cost = await redeemForTrees(userId, PILOT_PLOT_ID, redeemTrees)
      setRedeemed(cost)
      setRedeeming(false)
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not redeem')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="px-margin-mobile pt-1 pb-2">
      <h1 className="font-headline text-headline-xl font-bold text-on-surface">
        Wallet
      </h1>
      <p className="mt-0.5 text-label-lg text-on-surface-variant">
        Credits, earned only from verified check-ins
      </p>

      {error && <ErrorNote>{error}</ErrorNote>}

      {/* Amber hero — this is the one screen whose subject IS money. Skeleton
          while loading: rendering GH₵0.00 that then jumps to the real balance
          reads as a glitch on the one number people care about. */}
      {entries === null && !error ? (
        <div className="skeleton mt-stack-sm h-[122px] rounded-2xl" />
      ) : (
        <HeroCard
          accent
          label="Credits available"
          value={
            <>
              {available.toFixed(0)}
              <span className="text-headline-lg font-semibold opacity-60">
                {' '}
                {available === 1 ? 'credit' : 'credits'}
              </span>
            </>
          }
          foot={
            <span className="text-label-lg">
              Worth GH₵{available.toFixed(2)}, or {affordable}{' '}
              {affordable === 1 ? 'tree' : 'trees'} planted
            </span>
          }
        />
      )}

      {/*
        The stat strip is gone. Earned and Paid out are not two more headline
        figures - they are the arithmetic BEHIND the balance already stated
        above, and giving them their own cards made three money numbers of
        equal weight on a screen whose whole job is to answer one question.

        As a single line they read as the working: earned, minus paid out,
        leaves the balance in the card above.
      */}
      {/* Only once it says something the hero does not. Until a payout has
          happened, available and earned are the same number, and printing it
          twice makes the screen look like it is padding. */}
      {(paid > 0 || spent > 0) && (
        <p className="mt-2 text-label-lg text-on-surface-variant">
          <span className="tnum font-semibold text-on-surface">
            {total.toFixed(0)}
          </span>{' '}
          earned all time
          {paid > 0 && (
            <>
              {' · '}
              <span className="tnum font-semibold text-on-surface">
                {paid.toFixed(0)}
              </span>{' '}
              cashed out
            </>
          )}
          {spent > 0 && (
            <>
              {' · '}
              <span className="tnum font-semibold text-on-surface">
                {spent.toFixed(0)}
              </span>{' '}
              put back into trees
            </>
          )}
        </p>
      )}

      {/* NO window.alert(). This is the most anticipated tap in the app, and
          it used to produce an unstyled browser dialog quoting a file path in
          the repository. An inline note answers the question in the app's own
          voice, and stays on screen to be read. */}
      {/*
        TWO DOORS, AND THE ORDER IS THE ARGUMENT.

        Putting trees first is not decoration. Cashing out is a leak - the money
        leaves and the grove is no bigger. Redeeming recirculates it, and the
        person choosing is the one who already knows which land needs planting.
        Both are offered plainly; the default is the one that compounds.
      */}
      <div className="mt-2.5 grid gap-2.5">
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={affordable < 1}
          onClick={() => {
            setRedeemed(null)
            setRedeeming((r) => !r)
          }}
        >
          <Icon name="tree" size={19} />
          Put credits back into trees
        </button>

        <button
          type="button"
          className="btn btn-secondary btn-block"
          disabled={available < MIN_WITHDRAWAL}
          onClick={() => setPayoutNote(true)}
        >
          <Icon name="wallet" size={19} />
          Cash out to Mobile Money
        </button>
      </div>

      {redeeming && (
        <div className="card mt-2.5">
          <p className="font-headline text-headline-md font-bold text-on-surface">
            How many trees?
          </p>
          <p className="mt-0.5 text-label-lg text-on-surface-variant">
            {CREDITS_PER_TREE} credits funds one tree for a year of monitoring.
          </p>

          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              aria-label="Fewer trees"
              className="btn btn-secondary size-11 px-0"
              onClick={() => setRedeemTrees((n) => Math.max(1, n - 1))}
            >
              <Icon name="x" size={16} />
            </button>
            <span className="tnum flex-1 text-center font-headline text-display-md font-bold text-on-surface">
              {redeemTrees}
            </span>
            <button
              type="button"
              aria-label="More trees"
              className="btn btn-secondary size-11 px-0"
              disabled={redeemTrees >= affordable}
              onClick={() => setRedeemTrees((n) => Math.min(affordable, n + 1))}
            >
              <Icon name="plus" size={16} />
            </button>
          </div>

          <div className="mt-3 flex items-baseline justify-between border-t border-outline-variant pt-3">
            <span className="font-semibold text-on-surface">Costs</span>
            <span className="tnum font-headline text-headline-lg font-bold text-accent">
              {redeemTrees * CREDITS_PER_TREE} credits
            </span>
          </div>

          <button
            type="button"
            className="btn btn-primary btn-block mt-3"
            disabled={busy}
            onClick={() => void doRedeem()}
          >
            {busy
              ? 'Redeeming...'
              : `Plant ${redeemTrees} ${redeemTrees === 1 ? 'tree' : 'trees'}`}
          </button>
        </div>
      )}

      {redeemed !== null && (
        <div className="note-good mt-2.5">
          <p className="flex items-center gap-2 font-semibold">
            <Icon name="check-circle" size={16} />
            {redeemed} credits are now funding trees
          </p>
          <p className="mt-1.5 text-label-lg">
            They pay a planter only as each tree passes verification, on exactly
            the terms a sponsor's money does. Nothing is released up front.
          </p>
        </div>
      )}

      {payoutNote && (
        <div className="note-warn mt-2.5">
          <p className="flex items-center gap-2 font-semibold">
            <Icon name="clock" size={16} />
            Payouts open after the pilot
          </p>
          <p className="mt-1.5 text-label-lg">
            Your balance keeps accruing and nothing is lost. Mobile Money runs
            against the MTN sandbox for now, so no real transfer is made yet.
          </p>
        </div>
      )}

      {available < MIN_WITHDRAWAL && (
        <p className="mt-2.5 text-center text-label-lg text-on-surface-variant">
          {affordable >= 1
            ? `Cashing out needs ${MIN_WITHDRAWAL} credits. You can still put yours into trees.`
            : `Earn ${CREDITS_PER_TREE} credits to fund a tree, or ${MIN_WITHDRAWAL} to cash out.`}
        </p>
      )}

      {/* The claim worth making on this screen — one line on the surface, the
          reasoning behind the tap. It was a five-line green box competing with
          the balance it was explaining. */}
      <details className="disclosure mt-2.5">
        <summary>
          <Icon name="shield" size={17} className="shrink-0 text-[var(--color-verified)]" />
          You cannot pay yourself
        </summary>
        <div className="disclosure-body">
          Money appears here only when a check-in passes verification, and no
          client can write to this ledger - not even yours. Both locks live in
          the database: the ledger is insert-only from a trigger, and the
          verdict that fires it is writable only by the verification service.
        </div>
      </details>

      <h2 className="section-h">Credits earned</h2>

      {entries === null && !error && (
        <div className="flex flex-col gap-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card flex items-center justify-between gap-3 py-3">
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-2/5 rounded" />
                <div className="skeleton h-3 w-1/3 rounded" />
              </div>
              <div className="skeleton h-5 w-20 rounded" />
            </div>
          ))}
        </div>
      )}

      {entries?.length === 0 && (
        <EmptyState
          title="Nothing earned yet"
          body="Money accrues when a check-in passes verification. Register a tree and check in on it."
        />
      )}

      <ul className="rise-stagger flex flex-col gap-2.5">
        {entries?.map((e) => (
          <li key={e.id} className="card flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="font-bold text-on-surface">
                {e.reason.startsWith('checkin_') ? 'Verified check-in' : e.reason}
              </p>
              <p className="text-label-lg text-on-surface-variant">
                {new Date(e.created_at).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
                {' · '}
                {LEDGER_STATUS[e.status] ?? 'Recorded'}
              </p>
            </div>
            <p className="tnum shrink-0 font-headline text-headline-md font-bold text-[var(--color-verified)]">
              +{Number(e.amount_ghs).toFixed(0)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}

