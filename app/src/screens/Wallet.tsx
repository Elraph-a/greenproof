import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import { DEMO, demoLedger } from '../lib/demo'
import { Icon } from '../components/Icon'
import { EmptyState, ErrorNote, HeroCard } from '../components/ui'
import type { LedgerEntry } from '../lib/types'

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

/** Below this, a transfer fee would eat most of a GH₵2 payment. */
const MIN_WITHDRAWAL_GHS = 10

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
  const [entries, setEntries] = useState<LedgerEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [payoutNote, setPayoutNote] = useState(false)

  useEffect(() => {
    if (!userId) return
    if (DEMO) {
      setEntries(demoLedger)
      return
    }
    supabase
      .from('ledger_entries')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .then(({ data, error: e }) => {
        if (e) setError(e.message)
        else setEntries((data ?? []) as unknown as LedgerEntry[])
      })
  }, [userId])

  const total = (entries ?? []).reduce((s, e) => s + Number(e.amount_ghs), 0)
  const paid = (entries ?? [])
    .filter((e) => e.status === 'paid')
    .reduce((s, e) => s + Number(e.amount_ghs), 0)
  const available = total - paid

  return (
    <div className="px-margin-mobile pt-1 pb-2">
      <h1 className="font-headline text-headline-xl font-bold text-on-surface">
        Wallet
      </h1>
      <p className="mt-0.5 text-label-lg text-on-surface-variant">
        Earned only from verified check-ins
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
          label="Available balance"
          value={`GH₵${available.toFixed(2)}`}
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
      {paid > 0 && (
        <p className="mt-2 text-label-lg text-on-surface-variant">
          <span className="tnum font-semibold text-on-surface">
            GH₵{total.toFixed(2)}
          </span>{' '}
          earned all time ·{' '}
          <span className="tnum font-semibold text-on-surface">
            GH₵{paid.toFixed(2)}
          </span>{' '}
          paid out
        </p>
      )}

      {/* NO window.alert(). This is the most anticipated tap in the app, and
          it used to produce an unstyled browser dialog quoting a file path in
          the repository. An inline note answers the question in the app's own
          voice, and stays on screen to be read. */}
      <button
        type="button"
        className="btn btn-primary btn-block mt-2.5"
        disabled={available < MIN_WITHDRAWAL_GHS}
        onClick={() => setPayoutNote(true)}
      >
        <Icon name="wallet" size={19} />
        Withdraw to Mobile Money
      </button>

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

      {available < MIN_WITHDRAWAL_GHS && (
        <p className="mt-2.5 text-center text-label-lg text-on-surface-variant">
          Minimum withdrawal GH₵{MIN_WITHDRAWAL_GHS.toFixed(2)}
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
          client can write to this ledger — not even yours. Both locks live in
          the database: the ledger is insert-only from a trigger, and the
          verdict that fires it is writable only by the verification service.
        </div>
      </details>

      <h2 className="section-h">Earnings</h2>

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
              +GH₵{Number(e.amount_ghs).toFixed(2)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}

