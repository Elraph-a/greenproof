import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import { DEMO, demoLedger } from '../lib/demo'
import { Icon } from '../components/Icon'
import { EmptyState, ErrorNote } from '../components/ui'
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

      {/* Amber leads here — this is the one screen whose subject IS money. */}
      <div className="mt-stack-sm rounded-2xl bg-accent-container p-5">
        <span className="micro text-on-accent-container/75">Available balance</span>
        <p className="tnum mt-1.5 font-headline text-display-lg font-bold text-on-accent-container">
          GH₵{available.toFixed(2)}
        </p>
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        <Figure label="Earned" value={`GH₵${total.toFixed(2)}`} />
        <Figure label="Paid out" value={`GH₵${paid.toFixed(2)}`} />
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
        <div className="note mt-2.5">
          <p className="text-label-lg text-on-surface-variant">
            Minimum withdrawal is GH₵{MIN_WITHDRAWAL_GHS.toFixed(2)}. Batching
            stops a per-transfer fee from eating a GH₵2 payment.
          </p>
        </div>
      )}

      {/* The claim worth making on this screen, where the money is. */}
      <div className="note-good mt-2.5 flex gap-2.5">
        <Icon name="shield" size={16} className="mt-0.5 shrink-0" />
        <p className="text-label-lg">
          Money appears here only when a check-in passes verification. No client
          can write to this ledger — not even yours.
        </p>
      </div>

      <h2 className="mt-stack-md mb-2.5 font-headline text-headline-md font-bold text-on-surface">
        Earnings
      </h2>

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

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-3.5">
      <span className="micro">{label}</span>
      <p className="tnum mt-1.5 font-headline text-headline-lg font-bold text-on-surface">
        {value}
      </p>
    </div>
  )
}
