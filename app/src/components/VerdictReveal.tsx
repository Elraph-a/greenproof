import { useEffect, useState } from 'react'
import { Icon, type IconName } from './Icon'
import { Spinner } from './ui'
import type { Checkin, CheckinVerdict } from '../lib/types'

/**
 * The check-in result — built to docs/design/v2/09.
 *
 * PROGRESSIVE REVEAL, NOT A TABLE. The confidence number alone is unfalsifiable
 * ("trust us, 87"), and the raw `signals` blob is unreadable standing in a
 * field. So the screen states the verdict, then names each check that produced
 * it with the actual measurement beside it. That is the difference between a
 * score and an explanation, and it is the whole reason `signals` is never
 * collapsed to a single column.
 */

interface Props {
  checkin: Checkin | null
  timedOut: boolean
  error: string | null
  treeName?: string
  tagCode?: string | null
  onAgain?: () => void
  /**
   * Retry the SAME submission, reusing the photos already in memory.
   *
   * Without this a dropped connection on the tap that decides whether someone
   * is paid discarded two photos, the trunk taps and the compass heading -
   * ninety seconds of work at the tree, with the only control on screen being
   * the close button. The planter had to walk back and do it again.
   */
  onRetry?: () => void
  onDone: () => void
}

const VERDICT: Record<
  CheckinVerdict,
  { label: string; chip: string; ring: string; blurb: string }
> = {
  verified: {
    label: 'Verified',
    chip: 'chip-verified',
    ring: 'var(--color-verified)',
    blurb: 'All checks passed. Earnings have been added to your wallet.',
  },
  review: {
    label: 'Needs review',
    chip: 'chip-review',
    ring: 'var(--color-accent)',
    blurb:
      'One or more checks were uncertain. A reviewer will look at this photo. Nothing is lost, and you do not need to walk back.',
  },
  flagged: {
    label: 'Flagged',
    chip: 'chip-flagged',
    ring: 'var(--color-error)',
    blurb:
      'A check failed outright. This visit will not be paid until someone has looked at it.',
  },
  pending: {
    label: 'Not checked',
    chip: 'chip-pending',
    ring: 'var(--color-outline)',
    blurb: 'Waiting to be scored.',
  },
}

export function VerdictReveal({
  checkin,
  timedOut,
  error,
  treeName,
  tagCode,
  onAgain,
  onRetry,
  onDone,
}: Props) {
  /* ---- still scoring, timed out, or failed -------------------------- */
  if (!checkin) {
    return (
      <Frame treeName={treeName} tagCode={tagCode} onDone={onDone}>
        <div className="flex flex-col items-center pt-stack-lg text-center">
          {error ? (
            <>
              <span className="flex size-[72px] items-center justify-center rounded-full bg-error-container text-on-error-container">
                <Icon name="warning" size={36} />
              </span>
              <h2 className="mt-stack-md font-headline text-headline-xl font-bold text-on-surface">
                Could not submit
              </h2>
              <p className="mt-2 max-w-[290px] text-on-surface-variant">
                Your photos are still here. Nothing has been lost.
              </p>
              {onRetry && (
                <button
                  type="button"
                  className="btn btn-primary btn-block mt-stack-md"
                  onClick={onRetry}
                >
                  <Icon name="refresh" size={19} />
                  Try again
                </button>
              )}
              {/* The technical reason is kept, but out of the way. A planter
                  standing at a tree needs to know whether to retry, not to
                  read a Postgres error. */}
              <details className="disclosure mt-2.5 w-full text-left">
                <summary>What went wrong</summary>
                <div className="disclosure-body">{error}</div>
              </details>
            </>
          ) : timedOut ? (
            <>
              <span className="flex size-[72px] items-center justify-center rounded-full bg-tertiary-container text-on-tertiary-container">
                <Icon name="clock" size={36} />
              </span>
              <h2 className="mt-stack-md font-headline text-headline-xl font-bold text-on-surface">
                Saved. Still scoring
              </h2>
              {/* Fail safe, not fail closed: the visit is recorded either way. */}
              <p className="mt-2 max-w-[290px] text-on-surface-variant">
                Your check-in is saved and will be scored shortly. You can walk
                on. Nothing is lost, and the result appears on the tree's page.
              </p>
            </>
          ) : (
            <>
              <Spinner className="size-10 text-primary" />
              <h2 className="mt-stack-md font-headline text-headline-xl font-bold text-on-surface">
                Checking…
              </h2>
              <p className="mt-2 max-w-[280px] text-on-surface-variant">
                Comparing this visit against the tree's history.
              </p>
            </>
          )}
        </div>
      </Frame>
    )
  }

  /* ---- a real verdict ----------------------------------------------- */
  const v = VERDICT[checkin.verdict] ?? VERDICT.pending
  const confidence = checkin.confidence ?? 0
  const checks = buildChecks(checkin)
  const passed = checks.filter((c) => c.passed).length
  const earned = checkin.verdict === 'verified' ? 4.5 : null

  return (
    <Frame treeName={treeName} tagCode={tagCode} onDone={onDone} earned={earned}>
      <div className="flex flex-col items-center pt-stack-sm">
        <Gauge value={confidence} colour={v.ring} />
        <span className={`chip mt-4 px-4 py-1.5 text-label-lg ${v.chip}`}>
          {v.label}
        </span>
      </div>

      <div className="note mt-stack-md flex gap-2.5">
        <Icon name="shield" size={16} className="mt-0.5 shrink-0 text-on-surface-variant" />
        <p className="text-label-lg text-on-surface-variant">{v.blurb}</p>
      </div>

      <div className="mt-stack-md mb-2.5 flex items-baseline justify-between">
        <h3 className="text-label-lg font-semibold text-on-surface">
          Verification checks
        </h3>
        <span className="tnum text-label-lg text-on-surface-variant">
          {passed}/{checks.length} passed
        </span>
      </div>

      {/* The checks arrive under the gauge rather than with it, so the eye
          reads the verdict first and the reasons second - which is the order a
          planter actually needs them in. */}
      <div className="rise-stagger flex flex-col gap-2">
        {checks.map((c) => (
          <div key={c.title} className="card flex items-center gap-3 py-3">
            <span
              className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
                c.passed
                  ? 'bg-[var(--color-verified-container)] text-[var(--color-verified)]'
                  : 'bg-tertiary-container text-on-tertiary-container'
              }`}
            >
              <Icon name={c.icon} size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-on-surface">{c.title}</p>
              <p className="text-label-md text-on-surface-variant">{c.detail}</p>
            </div>
            <span className={`chip shrink-0 ${c.passed ? 'chip-verified' : 'chip-review'}`}>
              <Icon name={c.passed ? 'check' : 'warning'} size={11} />
              {c.passed ? 'Passed' : 'Unsure'}
            </span>
          </div>
        ))}
      </div>

      {onAgain && (
        <button type="button" className="btn btn-primary btn-block mt-stack-md" onClick={onAgain}>
          Check in another tree
        </button>
      )}
      <button type="button" className="btn btn-secondary btn-block mt-2" onClick={onDone}>
        Back to My Grove
      </button>
    </Frame>
  )
}

/* -------------------------------------------------------------------------- */

function Frame({
  treeName,
  tagCode,
  earned,
  onDone,
  children,
}: {
  treeName?: string
  tagCode?: string | null
  earned?: number | null
  onDone: () => void
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="safe-top sticky top-0 z-30 flex items-center gap-3 bg-background px-margin-mobile pt-3 pb-2.5">
        <button
          type="button"
          aria-label="Close"
          onClick={onDone}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-container text-on-surface active:bg-surface-container-high"
        >
          <Icon name="x" size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="font-headline text-headline-lg font-bold text-on-surface">
            Check-In result
          </h1>
          {treeName && (
            <p className="truncate text-label-md text-on-surface-variant">
              {treeName}
              {tagCode ? ` · ${tagCode}` : ''}
            </p>
          )}
        </div>
        {earned != null && (
          <span className="chip chip-money tnum shrink-0">
            +GH₵{earned.toFixed(2)} earned
          </span>
        )}
      </header>

      <main className="flex-1 px-margin-mobile pb-stack-lg">{children}</main>
    </div>
  )
}

/**
 * Interpolate 0 -> target so the arc draws and the number counts together.
 *
 * Driven in JS rather than by a CSS transition because the READOUT has to move
 * too: a transition can animate the arc's stroke, but the digits are React
 * state and would jump straight to the answer while the arc was still filling.
 * Watching a number settle on 84 is the difference between a readout and a
 * verdict, and this is the one screen in the app where that beat is earned.
 *
 * Cubic ease-out, matching --ease-out closely enough that the arc and every
 * CSS entrance on this screen feel like one movement.
 */
function useCountUp(target: number, ms = 900): number {
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target)
      return
    }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms)
      setValue(target * (1 - Math.pow(1 - t, 3)))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])

  return value
}

/** Circular confidence dial. An arc reads as "how close to full" at a glance. */
function Gauge({ value, colour }: { value: number; colour: string }) {
  const R = 62
  const C = 2 * Math.PI * R
  // 270° sweep, opening at the bottom — a full ring has no visible start or
  // end, so the eye cannot judge how far along the value sits.
  const SWEEP = 0.75
  const target = Math.max(0, Math.min(100, value))

  /**
   * The arc sweeps up from zero, and the number counts with it.
   *
   * This is the only place in the app that spends a long beat, and it is
   * earned: it is seen a handful of times a day, and it is the moment a
   * planter finds out whether the visit they just walked to counted. A number
   * that simply appears states a result; an arc that fills lets you watch it
   * arrive, and a value settling at 84 rather than jumping there is the
   * difference between a readout and a verdict.
   *
   * Two frames of delay before starting: mounting at the target value would
   * make the browser skip the transition entirely.
   */
  const shown = useCountUp(target)

  const shownFilled = C * SWEEP * (shown / 100)

  return (
    <div className="relative size-[152px]">
      <svg viewBox="0 0 152 152" className="size-full -rotate-[225deg]">
        <circle
          cx="76"
          cy="76"
          r={R}
          fill="none"
          stroke="var(--color-surface-container-high)"
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={`${C * SWEEP} ${C}`}
        />
        <circle
          cx="76"
          cy="76"
          r={R}
          fill="none"
          stroke={colour}
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={`${shownFilled} ${C}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="flex size-7 items-center justify-center rounded-full" style={{ color: colour }}>
          <Icon name="check-circle" size={20} />
        </span>
        <span className="tnum font-headline text-display-md font-bold text-on-surface">
          {Math.round(shown)}%
        </span>
        <span className="text-label-md text-on-surface-variant">confidence</span>
      </div>
    </div>
  )
}

interface Check {
  icon: IconName
  title: string
  detail: string
  passed: boolean
}

/**
 * Turn the raw signals blob into three sentences a person can act on.
 *
 * Only three are shown. The full breakdown lives on the tree page — at the
 * moment of the reveal the user is standing in a field and needs to know
 * whether to walk on, not to audit a model.
 */
function buildChecks(c: Checkin): Check[] {
  const s = c.signals
  const scene = s?.scores?.scene_match
  const gps = s?.gates?.gps_radius ?? { passed: true, distance_m: undefined, allowed_m: 10 }
  const growth = s?.scores?.growth

  const out: Check[] = []

  out.push({
    icon: 'image',
    title: 'Photo alignment',
    detail:
      scene?.cosine_wide != null
        ? `${Math.round(scene.cosine_wide * 100)}% overlap with the reference frame`
        : 'No previous photo to compare against',
    passed: (scene?.score ?? 0) >= 60,
  })

  out.push({
    icon: 'target',
    title: 'GPS accuracy',
    detail:
      gps.distance_m != null
        ? `±${Math.round(gps.distance_m)} m, within the ${Math.round(gps.allowed_m ?? 10)} m threshold`
        : 'Position not recorded',
    passed: gps.passed !== false,
  })

  out.push({
    icon: 'ruler',
    title: 'Trunk measurement',
    detail:
      growth?.trunk_mm != null
        ? `${(growth.trunk_mm / 10).toFixed(1)} cm${
            growth.delta_mm != null
              ? `, ${growth.delta_mm >= 0 ? '+' : ''}${(growth.delta_mm / 10).toFixed(1)} cm since last check`
              : ''
          }`
        : 'Not measured this visit',
    passed: growth == null ? true : (growth.score ?? 0) >= 50,
  })

  return out
}
