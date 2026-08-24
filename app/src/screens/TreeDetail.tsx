import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { photoUrls } from '../lib/photos'
import { compassPoint } from '../lib/geo'
import { formatAge, getTree, listCheckins, treeLabel } from '../lib/trees'
import { demoCommonName, demoEarnings } from '../lib/demo'
import type { Checkin, Tree } from '../lib/types'
import { Icon, type IconName } from '../components/Icon'
import { ErrorNote, PhotoHero, StatusChip } from '../components/ui'

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
          /* The shape of what is coming — chips, stat tiles, photo timeline —
             rather than a spinner in a void. */
          <div>
            <div className="flex gap-2">
              <div className="skeleton h-7 w-20 rounded-full" />
              <div className="skeleton h-7 w-16 rounded-full" />
              <div className="skeleton h-7 w-32 rounded-full" />
            </div>
            <div className="mt-stack-sm grid grid-cols-3 gap-2.5">
              <div className="skeleton h-[104px] rounded-xl" />
              <div className="skeleton h-[104px] rounded-xl" />
              <div className="skeleton h-[104px] rounded-xl" />
            </div>
            <div className="skeleton mt-stack-md h-4 w-40 rounded" />
            <div className="mt-3 flex gap-3 overflow-hidden">
              <div className="skeleton h-56 w-44 shrink-0 rounded-xl" />
              <div className="skeleton h-56 w-44 shrink-0 rounded-xl" />
            </div>
          </div>
        ) : error ? (
          <ErrorNote>{error}</ErrorNote>
        ) : (
          <div className="flex flex-col items-center pt-stack-lg text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-surface-container text-on-surface-variant">
              <Icon name="tree" size={26} />
            </span>
            <p className="mt-stack-sm font-headline text-headline-md font-bold text-on-surface">
              This tree is not here
            </p>
            <p className="mt-1 max-w-[260px] text-on-surface-variant">
              It may have been removed, or the link is out of date.
            </p>
            <Link to="/grove" className="btn btn-outline mt-stack-md px-6">
              Back to My Grove
            </Link>
          </div>
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
      {/*
        THE EVIDENCE LEADS AND THE SCORE RIDES ON IT.

        This was a green card with "87/100" set at display size, and directly
        beneath it a comment calling the photo timeline the most important
        element on the page. Both cannot be true. The page is about one tree;
        the most recent photograph of that tree is the subject, and the
        confidence is a reading taken FROM it.

        Putting the number on the image also states the relationship correctly.
        A score floating in its own card reads as a fact about the app. A score
        pinned to a photograph reads as a fact about that photograph, which is
        what it actually is - and it is the same claim the pitch makes out
        loud: no verdict exists without evidence behind it.
      */}
      <PhotoHero
        photo={latest ? urls.get(latest.wide_photo) : null}
        alt={`Most recent photo of ${name}`}
        chip={<StatusChip status={latest?.verdict ?? 'pending'} />}
        eyebrow={
          latest
            ? `Last seen ${new Date(latest.captured_at).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
              })}`
            : 'No visits yet'
        }
        title={
          latest?.confidence != null ? (
            <span className="tnum">
              {latest.confidence}
              <span className="text-headline-lg font-semibold text-white/60">
                {' '}
                / 100 confidence
              </span>
            </span>
          ) : (
            'Not scored yet'
          )
        }
        sub={
          <>
            {checkins.length} {checkins.length === 1 ? 'visit' : 'visits'} ·
            registered {formatAge(tree.created_at)} ago
            {earned !== undefined && earned > 0 && ` · GH₵${earned} earned`}
          </>
        }
      />

      {/* ---- photo timeline: the most important element on the page ---- */}
      <h2 className="section-h">Photo timeline</h2>

      {checkins.length === 0 ? (
        <div className="card">
          <p className="text-on-surface-variant">
            No photos yet. If you registered this tree just now, it may still be
            uploading.
          </p>
        </div>
      ) : (
        <div className="hscroll hscroll-fade -mx-margin-mobile px-margin-mobile pb-2">
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
      <h2 className="section-h">Why this score</h2>
      {latest?.signals ? (
        <SignalBreakdown checkin={latest} />
      ) : (
        <div className="card">
          <p className="font-bold text-on-surface">Not scored yet</p>
          <p className="mt-1 text-label-lg text-on-surface-variant">
            Scored by the verification service after upload. Until then this
            stays <strong>pending</strong> - nothing counts as verified until it
            has been checked.
          </p>
        </div>
      )}

      {/*
        Registration facts and the tag caveat are reference material, not
        something a planter reads on every visit — so they sit one tap away
        instead of adding a third card and a paragraph to the scroll.
      */}
      <details className="disclosure mt-2.5">
        <summary>Registration details</summary>
        <div className="disclosure-body">
          <dl className="space-y-2.5">
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
            <Row icon="list" label="Species" value={tree.species || 'not recorded'} />
            <Row icon="list" label="Tag" value={tree.tag_code || 'none'} />
          </dl>
          <p className="mt-3 border-t border-outline-variant pt-3">
            A tag helps you find this tree again. It is not the tree's identity -
            identity is the position, the framing and the photo history above.
          </p>
        </div>
      </details>
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
        // Sits ABOVE the bottom nav, which is fixed at z-50. Without the
        // offset and the z-index the nav painted straight over this button:
        // elementFromPoint at its centre returned a nav link, so the primary
        // action on the most important screen in the app was unclickable
        // until the page was scrolled to its very bottom.
        <footer className="safe-bottom sticky bottom-[76px] z-[55] bg-background px-margin-mobile pt-2">
          {action}
        </footer>
      )}
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
      {/* The score itself is the page hero now — repeating it here was the
          same number twice within one screen height. */}
      <ul className="space-y-3">
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
                      ? '-'
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

      {/* Kept — it is the honesty claim and the Q&A teaching aid — but as one
          sentence rather than two, on the card it explains. */}
      <p className="mt-3.5 border-t border-outline-variant pt-3 text-label-md text-on-surface-variant">
        Four of these five are deterministic checks. Only "matches previous
        photos" is the model.
      </p>
    </div>
  )
}
