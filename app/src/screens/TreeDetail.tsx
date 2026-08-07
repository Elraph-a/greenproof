import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { photoUrls } from '../lib/photos'
import { compassPoint } from '../lib/geo'
import { formatAge, getTree, listCheckins, treeLabel } from '../lib/trees'
import { demoCommonName, demoEarnings } from '../lib/demo'
import type { Checkin, Tree } from '../lib/types'
import { Icon, type IconName } from '../components/Icon'
import { ErrorNote, Spinner, StatusChip } from '../components/ui'

/**
 * One tree's whole history.
 *
 * Built by EXTENDING the v2 vocabulary rather than inventing a layout: the
 * title bar from Register, the stat cards from My Grove, the check rows and
 * micro-labels from the check-in result. No new patterns.
 *
 * The photo timeline leads because it is the product's actual claim made
 * visible — identity here is a CHAIN of consistent observations, not a token.
 * A tree with four aligned photos is far harder to fake than one registration
 * shot, and the only way to show that is to put the four photos next to each
 * other.
 */
export function TreeDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [tree, setTree] = useState<Tree | null>(null)
  const [checkins, setCheckins] = useState<Checkin[]>([])
  const [urls, setUrls] = useState<Map<string, string>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    let alive = true
    ;(async () => {
      try {
        const [t, cs] = await Promise.all([getTree(id), listCheckins(id)])
        if (!alive) return
        setTree(t)
        setCheckins(cs)
        const paths = cs.flatMap((c) => [c.wide_photo, c.close_photo])
        if (paths.length) setUrls(await photoUrls(paths))
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : 'Could not load')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [id])

  const back = () => navigate('/grove')

  if (loading || error || !tree) {
    return (
      <Frame title="Tree" onBack={back}>
        {loading ? (
          <div className="flex justify-center py-stack-lg text-primary">
            <Spinner className="size-8" />
          </div>
        ) : error ? (
          <ErrorNote>{error}</ErrorNote>
        ) : (
          <p className="text-on-surface-variant">Tree not found.</p>
        )}
      </Frame>
    )
  }

  const latest = checkins[checkins.length - 1]
  const name = demoCommonName.get(tree.id) ?? treeLabel(tree)
  const earned = demoEarnings.get(tree.id)

  return (
    <Frame
      title={name}
      subtitle={tree.tag_code ?? undefined}
      onBack={back}
      action={
        <Link to={`/checkin?tree=${tree.id}`} className="btn btn-primary btn-block">
          <Icon name="camera" size={19} />
          Check in on this tree
        </Link>
      }
    >
      {/* ---- identity strip ------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip status={latest?.verdict ?? 'pending'} />
        {earned !== undefined && earned > 0 && (
          <span className="chip chip-money tnum">GH₵{earned}</span>
        )}
        <span className="text-label-lg text-on-surface-variant italic">
          {tree.species || 'Species not recorded'}
        </span>
      </div>

      {/* ---- three figures, same cards as My Grove --------------------- */}
      <div className="mt-stack-sm grid grid-cols-3 gap-2.5">
        <Stat
          icon="camera"
          value={String(checkins.length)}
          label={checkins.length === 1 ? 'Visit' : 'Visits'}
        />
        <Stat
          icon="check"
          value={latest?.confidence != null ? `${latest.confidence}%` : '—'}
          label="Confidence"
          tone="green"
        />
        <Stat icon="clock" value={formatAge(tree.created_at)} label="Registered" />
      </div>

      {/* ---- photo timeline: the most important element on the page ---- */}
      <h2 className="mt-stack-md mb-2 font-headline text-headline-md font-bold text-on-surface">
        Photo timeline
      </h2>
      <p className="mb-2.5 text-label-lg text-on-surface-variant">
        Each visit, in order. Consistency across these photos is what the
        identity claim rests on.
      </p>

      {checkins.length === 0 ? (
        <div className="card">
          <p className="text-on-surface-variant">
            No photos yet. If you registered this tree just now, it may still be
            uploading.
          </p>
        </div>
      ) : (
        <div className="-mx-margin-mobile overflow-x-auto px-margin-mobile pb-2">
          <ol className="flex gap-2.5">
            {checkins.map((c, i) => (
              <li key={c.id} className="w-[136px] shrink-0">
                <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-surface-container-high">
                  {urls.get(c.wide_photo) && (
                    <img
                      src={urls.get(c.wide_photo)}
                      alt={`Visit ${i + 1}`}
                      className="size-full object-cover"
                    />
                  )}
                  {c.confidence != null && (
                    <span className="tnum absolute right-1.5 bottom-1.5 rounded-full bg-black/70 px-2 py-0.5 text-label-md font-bold text-white backdrop-blur">
                      {c.confidence}%
                    </span>
                  )}
                </div>
                <p className="mt-1.5 font-semibold text-on-surface">
                  {i === 0 ? 'Registered' : `Visit ${i + 1}`}
                </p>
                <p className="text-label-md text-on-surface-variant">
                  {new Date(c.captured_at).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </p>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* ---- why this score ------------------------------------------- */}
      <h2 className="mt-stack-md mb-2.5 font-headline text-headline-md font-bold text-on-surface">
        Why this score
      </h2>
      {latest?.signals ? (
        <SignalBreakdown checkin={latest} />
      ) : (
        <div className="card">
          <p className="font-bold text-on-surface">Not scored yet</p>
          <p className="mt-1 text-label-lg text-on-surface-variant">
            Photos are scored by the verification service after upload. Until
            then this sits at <strong>pending</strong> — the safe default:
            nothing counts as verified until it has been checked.
          </p>
        </div>
      )}

      {/* ---- registration facts --------------------------------------- */}
      <h2 className="mt-stack-md mb-2.5 font-headline text-headline-md font-bold text-on-surface">
        Registration
      </h2>
      <div className="card">
        <dl className="space-y-2.5 text-label-lg">
          <Row
            icon="target"
            label="Position"
            value={`${tree.lat.toFixed(5)}, ${tree.lng.toFixed(5)}`}
          />
          <Row
            icon="compass"
            label="Facing"
            value={
              tree.heading_deg !== null
                ? `${compassPoint(tree.heading_deg)}, ${Math.round(tree.heading_deg)}°`
                : 'no compass reading'
            }
          />
          <Row icon="list" label="Tag" value={tree.tag_code || 'none'} />
        </dl>
        {/* The honesty point, on the screen where the tag is shown. */}
        <p className="mt-3 border-t border-outline-variant pt-3 text-label-md text-on-surface-variant">
          A tag helps you find this tree again. It is not the tree's identity —
          identity is the position, the framing and the photo history above.
        </p>
      </div>
    </Frame>
  )
}

/* -------------------------------------------------------------------------- */

function Frame({
  title,
  subtitle,
  onBack,
  action,
  children,
}: {
  title: string
  subtitle?: string
  onBack: () => void
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="safe-top sticky top-0 z-30 flex items-center gap-3 bg-background/95 px-margin-mobile pt-3 pb-2.5 backdrop-blur-md">
        <button
          type="button"
          aria-label="Go back"
          onClick={onBack}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-container text-on-surface active:bg-surface-container-high"
        >
          <Icon name="arrow-left" size={18} />
        </button>
        <div className="min-w-0">
          <h1 className="truncate font-headline text-headline-lg font-bold text-on-surface">
            {title}
          </h1>
          {subtitle && (
            <p className="truncate text-label-md text-on-surface-variant">{subtitle}</p>
          )}
        </div>
      </header>

      <main className="flex-1 px-margin-mobile pb-3">{children}</main>

      {action && (
        <footer className="safe-bottom sticky bottom-0 bg-background px-margin-mobile pt-2">
          {action}
        </footer>
      )}
    </div>
  )
}

function Stat({
  icon,
  value,
  label,
  tone,
}: {
  icon: IconName
  value: string
  label: string
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

function Row({
  icon,
  label,
  value,
}: {
  icon: IconName
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon name={icon} size={15} className="shrink-0 text-on-surface-variant" />
      <dt className="text-on-surface-variant">{label}</dt>
      <dd className="tnum ml-auto text-right font-semibold text-on-surface">{value}</dd>
    </div>
  )
}

/**
 * Location · Still alive · Not a duplicate · Matches previous photos.
 *
 * Rendered straight from `signals` jsonb and deliberately never collapsed into
 * one number — the breakdown is the debugging tool, the Q&A teaching aid, and
 * what makes a confidence score explicable to a farmer.
 */
function SignalBreakdown({ checkin }: { checkin: Checkin }) {
  const s = checkin.signals
  const rows: { name: string; icon: IconName; score?: number; gate?: boolean }[] = [
    {
      name: 'Location',
      icon: 'target',
      score: s?.scores?.location?.score,
      gate: s?.gates?.gps_radius?.passed,
    },
    { name: 'Still alive', icon: 'tree', score: s?.scores?.liveness?.score },
    { name: 'Not a duplicate', icon: 'shield', gate: s?.gates?.duplicate_image?.passed },
    { name: 'Matches previous photos', icon: 'image', score: s?.scores?.scene_match?.score },
    { name: 'Growth plausible', icon: 'ruler', score: s?.scores?.growth?.score },
  ]

  return (
    <div className="card">
      <div className="flex items-baseline gap-1.5">
        <span className="tnum font-headline text-display-md font-bold text-[var(--color-verified)]">
          {checkin.confidence ?? '—'}
        </span>
        <span className="text-headline-md text-on-surface-variant">/100</span>
      </div>

      <ul className="mt-3 space-y-3">
        {rows.map((r) => {
          // Signal scores are ALREADY 0–100 (see lib/types.ts Signals). An
          // earlier ×100 here rendered "9600%" on a score of 96.
          const pct =
            r.score !== undefined
              ? Math.max(0, Math.min(100, r.score))
              : r.gate === undefined
                ? 0
                : 100
          const failed = r.gate === false
          return (
            <li key={r.name}>
              <div className="mb-1.5 flex items-center gap-2">
                <Icon
                  name={r.icon}
                  size={14}
                  className={failed ? 'text-error' : 'text-on-surface-variant'}
                />
                <span className="font-semibold text-on-surface">{r.name}</span>
                <span className="tnum ml-auto text-label-lg text-on-surface-variant">
                  {r.score !== undefined
                    ? `${Math.round(r.score)}%`
                    : r.gate === undefined
                      ? '—'
                      : r.gate
                        ? 'passed'
                        : 'failed'}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-container-high">
                <div
                  className={`h-full rounded-full ${failed ? 'bg-error' : 'bg-[var(--color-verified)]'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          )
        })}
      </ul>

      <p className="mt-3 border-t border-outline-variant pt-3 text-label-md text-on-surface-variant">
        Five signals, never collapsed into one. Four of the five are
        deterministic checks — only "matches previous photos" is the model.
      </p>
    </div>
  )
}
