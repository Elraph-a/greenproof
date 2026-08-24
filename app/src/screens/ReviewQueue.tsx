import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import { photoUrls } from '../lib/photos'
import type { ReviewQueueRow } from '../lib/types'
import { Icon } from '../components/Icon'
import {
  EmptyState,
  ErrorNote,
  Spinner,
  StatusChip,
} from '../components/ui'

/**
 * The human half of "designed to degrade, not break".
 *
 * Two kinds of item appear here, and the second is the interesting one:
 *
 *   1. verdict = 'review' - the model was not confident enough. Obvious.
 *   2. audit_sample       - a RANDOM 10% of AUTO-APPROVED check-ins.
 *
 * Reviewing only the uncertain cases would tell us nothing about how often the
 * system was confidently WRONG. Sampling auto-approvals is the only way to
 * estimate the false-accept rate - the number the whole pitch rests on, because
 * a wrongly rejected genuine visit is annoying while a wrongly approved fraud is
 * fatal.
 *
 * Nobody else in reforestation verification publishes that number. This screen
 * is where ours comes from.
 */
export function ReviewQueue() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<ReviewQueueRow[] | null>(null)
  const [urls, setUrls] = useState<Map<string, string>>(new Map())
  const [active, setActive] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const { data, error: e } = await supabase
        .from('review_queue')
        .select('*')
        .limit(50)
      if (e) throw new Error(e.message)
      const list = (data ?? []) as unknown as ReviewQueueRow[]
      setRows(list)
      setActive(0)
      const paths = list.flatMap((r) => [r.wide_photo, r.close_photo])
      if (paths.length) setUrls(await photoUrls(paths))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the queue')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function decide(verdict: 'verified' | 'flagged') {
    const row = rows?.[active]
    if (!row) return
    setBusy(true)
    setError(null)
    try {
      // A SECURITY DEFINER function, not a direct update: clients are never
      // granted checkins.verdict. See migration 0006.
      const { error: e } = await supabase.rpc('review_checkin', {
        p_checkin_id: row.id,
        p_verdict: verdict,
        p_note: null,
      })
      if (e) throw new Error(e.message)
      setRows((prev) => (prev ? prev.filter((r) => r.id !== row.id) : prev))
      setActive(0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the decision')
    } finally {
      setBusy(false)
    }
  }

  if (profile && profile.role !== 'reviewer') {
    return (
      <div className="px-margin-mobile pt-1 pb-2">
        <h1 className="font-headline text-headline-xl font-bold text-on-surface">
          Review
        </h1>
        <EmptyState
          title="Reviewer access only"
          body={`This queue is for reviewers. Your account is set to ${profile.role}.`}
        />
      </div>
    )
  }

  const row = rows?.[active]

  return (
    <div className="px-margin-mobile pt-1 pb-2">
      <h1 className="font-headline text-headline-xl font-bold text-on-surface">
        Review queue
      </h1>
      <p className="mt-0.5 text-label-lg text-on-surface-variant">
        Uncertain check-ins, plus random audits of auto-approvals
      </p>

      {error && <ErrorNote>{error}</ErrorNote>}

      {rows === null && (
        <div className="flex justify-center py-stack-lg text-primary">
          <Spinner className="size-8" />
        </div>
      )}

      {rows?.length === 0 && (
        <EmptyState
          title="Nothing to review"
          body="No uncertain check-ins and no audit samples waiting. This is the good state."
        />
      )}

      {row && (
        <div>
          <div className="mb-stack-sm flex items-center justify-between">
            <p className="font-bold text-on-surface-variant">
              {active + 1} of {rows!.length}
            </p>
            {row.is_audit ? (
              <span className="chip chip-review">Random audit</span>
            ) : (
              <StatusChip status={row.verdict} />
            )}
          </div>

          {/* An audit item was ALREADY auto-approved. Saying so up front stops
              the reviewer treating the machine's answer as the question - the
              entire point is to catch it being wrong. */}
          {row.is_audit && (
            <div className="note-warn mb-3">
              <p className="flex items-center gap-2 font-headline text-headline-md font-bold">
                <Icon name="shield" size={18} />
                Auto-approved at {row.confidence}/100
              </p>
              <p className="mt-1 text-label-lg">
                This is a random spot-check. Judge it on the photos alone - if
                the system got it wrong, that is exactly what we need to record.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            <figure className="m-0">
              <img
                src={urls.get(row.wide_photo)}
                alt="Wide"
                className="aspect-[3/4] w-full rounded-xl bg-surface-container-high object-cover"
              />
              <figcaption className="micro mt-1.5">Wide</figcaption>
            </figure>
            <figure className="m-0">
              <img
                src={urls.get(row.close_photo)}
                alt="Close-up"
                className="aspect-[3/4] w-full rounded-xl bg-surface-container-high object-cover"
              />
              <figcaption className="micro mt-1.5">Close-up</figcaption>
            </figure>
          </div>

          <div className="card mt-2.5">
            <div className="mb-2.5 flex items-baseline gap-1.5">
              <span className="tnum font-headline text-display-md font-bold text-on-surface">
                {row.confidence ?? '-'}
              </span>
              <span className="text-headline-md text-on-surface-variant">/100</span>
            </div>
            <dl className="space-y-2 text-label-lg">
              <Row
                label="Location"
                value={
                  row.signals?.gates?.gps_radius?.distance_m !== undefined
                    ? `${row.signals.gates.gps_radius.distance_m} m from registration`
                    : '-'
                }
              />
              <Row label="Still alive" value={fmtPct(row.signals?.scores?.liveness?.score)} />
              <Row
                label="Not a duplicate"
                value={
                  row.signals?.gates?.duplicate_image?.nearest_phash_distance !== undefined
                    ? `${row.signals.gates.duplicate_image.nearest_phash_distance} bits from nearest`
                    : '-'
                }
              />
              <Row
                label="Matches previous photos"
                value={fmtPct(row.signals?.scores?.scene_match?.score)}
              />
              <Row label="Blur" value={row.blur_score?.toFixed(0) ?? '-'} />
            </dl>
          </div>

          <div className="mt-stack-md flex gap-3">
            <button
              type="button"
              className="btn btn-danger flex-1"
              disabled={busy}
              onClick={() => void decide('flagged')}
            >
              {busy ? <Spinner /> : 'Reject'}
            </button>
            <button
              type="button"
              className="btn btn-primary flex-1"
              disabled={busy}
              onClick={() => void decide('verified')}
            >
              {busy ? <Spinner /> : 'Approve'}
            </button>
          </div>

          {rows!.length > 1 && (
            <button
              type="button"
              className="btn btn-ghost btn-block mt-2"
              onClick={() => setActive((a) => (a + 1) % rows!.length)}
            >
              Skip for now
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function fmtPct(v: number | undefined) {
  return v === undefined ? '-' : `${Math.round(v * 100)}%`
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-on-surface-variant">{label}</dt>
      <dd className="text-right font-bold text-on-surface">{value}</dd>
    </div>
  )
}
