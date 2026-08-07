import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import { DEMO, demoLedger } from '../lib/demo'
import { Icon } from '../components/Icon'
import { EmptyState, ErrorNote, HeroCard, StatCell, StatStrip } from '../components/ui'
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

export function Wallet() {
  const { userId } = useAuth()
  const [entries, setEntries] = useState<LedgerEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

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

      <div className="mt-2.5">
        <StatStrip>
          <StatCell label="Earned" value={`GH₵${total.toFixed(2)}`} />
          <StatCell label="Paid out" value={`GH₵${paid.toFixed(2)}`} />
        </StatStrip>
      </div>

      <button
        type="button"
        className="btn btn-primary btn-block mt-2.5"
        disabled={available < MIN_WITHDRAWAL_GHS}
        onClick={() =>
          alert(
            'Mobile Money payout runs against the MTN sandbox behind a mock adapter, ' +
              'and is not enabled for the pilot. See docs/DEFEND.md.',
          )
        }
      >
        <Icon name="wallet" size={19} />
        Withdraw to Mobile Money
      </button>

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

      <ul className="flex flex-col gap-2.5">
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
                {e.status}
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

