import { useEffect, useState } from 'react'
import { compassPoint, headingFromOrientation, useHeading } from '../lib/geo'
import { Icon } from '../components/Icon'

/**
 * A field test for the compass, and nothing else.
 *
 * WHY THIS EXISTS. The heading was wrong in the field by however far the phone
 * was rolled, and the reason it survived so long is that the error is ZERO when
 * the phone is held flat and level - which is exactly how anybody would test it
 * at a desk. Proving the fix therefore needs a device, held the way the app is
 * actually used, pointed at something whose direction is known.
 *
 * So this screen shows the corrected heading, the OLD formula beside it, and
 * the raw sensor values behind both. If the two numbers differ and the new one
 * matches a real compass, the fix is doing its job. If they agree, the phone is
 * simply level and the test is not yet exercising the bug - roll it and look
 * again.
 *
 * Deliberately unlinked from the navigation. It is a diagnostic, reached by
 * typing /compass, and it has no place in a planter's flow.
 */
export function CompassCheck() {
  const { heading, state, request } = useHeading(true)
  const [raw, setRaw] = useState<{ a: number; b: number; g: number; abs: boolean } | null>(null)
  const [events, setEvents] = useState({ absolute: 0, plain: 0 })

  useEffect(() => {
    const onAbsolute = (ev: Event) => {
      const e = ev as DeviceOrientationEvent
      setEvents((n) => ({ ...n, absolute: n.absolute + 1 }))
      if (e.alpha != null && e.beta != null && e.gamma != null) {
        setRaw({ a: e.alpha, b: e.beta, g: e.gamma, abs: e.absolute })
      }
    }
    const onPlain = () => setEvents((n) => ({ ...n, plain: n.plain + 1 }))

    window.addEventListener('deviceorientationabsolute', onAbsolute)
    window.addEventListener('deviceorientation', onPlain)
    return () => {
      window.removeEventListener('deviceorientationabsolute', onAbsolute)
      window.removeEventListener('deviceorientation', onPlain)
    }
  }, [])

  // What the app used to compute, shown for comparison only.
  const old = raw ? ((360 - raw.a) % 360 + 360) % 360 : null
  const fixed = raw ? headingFromOrientation(raw.a, raw.b, raw.g) : null
  const gap =
    old !== null && fixed !== null
      ? Math.abs(((((fixed - old) % 360) + 540) % 360) - 180)
      : null

  return (
    <div className="min-h-dvh bg-background px-margin-mobile py-6">
      <h1 className="font-headline text-headline-lg font-bold text-on-surface">
        Compass check
      </h1>
      <p className="mt-1 text-label-lg text-on-surface-variant">
        Diagnostic only. Hold the phone upright, as if photographing a tree.
      </p>

      {state === 'needs-permission' && (
        <button type="button" className="btn btn-primary btn-block mt-4" onClick={() => void request()}>
          <Icon name="compass" size={20} />
          Enable compass
        </button>
      )}
      {state === 'unsupported' && (
        <div className="note-warn mt-4">This device has no orientation sensor.</div>
      )}
      {state === 'denied' && (
        <div className="note-warn mt-4">
          Permission refused. Reload the page to be asked again.
        </div>
      )}

      {/* ---- the reading ------------------------------------------- */}
      <div className="card mt-4 text-center">
        <p className="text-label-md text-on-surface-variant">Corrected heading</p>
        <p className="tnum font-headline text-[56px] font-bold leading-none text-primary">
          {heading === null ? '--' : Math.round(heading)}
          <span className="text-headline-md">&deg;</span>
        </p>
        <p className="font-bold text-on-surface">
          {heading === null ? 'no reading' : compassPoint(heading)}
        </p>

        <div className="relative mx-auto mt-4 size-40">
          <div className="absolute inset-0 rounded-full border-4 border-outline-variant" />
          {['N', 'E', 'S', 'W'].map((c, i) => (
            <span
              key={c}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-label-md font-bold text-on-surface-variant"
              style={{ transform: `translate(-50%,-50%) rotate(${i * 90}deg) translateY(-68px) rotate(${-i * 90}deg)` }}
            >
              {c}
            </span>
          ))}
          {heading !== null && (
            <div
              className="absolute left-1/2 top-1/2 h-16 w-1 origin-bottom -translate-x-1/2 -translate-y-full rounded-full bg-primary transition-transform duration-100"
              style={{ transform: `translate(-50%,-100%) rotate(${heading}deg)` }}
            />
          )}
        </div>
        <p className="mt-3 text-label-md text-on-surface-variant">
          The needle points where the back camera is aimed.
        </p>
      </div>

      {/* ---- old vs new, which is the whole point ------------------- */}
      <div className="card mt-3">
        <p className="font-bold text-on-surface">Old formula vs fixed</p>
        <dl className="mt-2 space-y-1.5 text-label-lg">
          <Row label="Fixed (full orientation)" value={fixed === null ? 'no bearing' : `${Math.round(fixed)}°`} />
          <Row label="Old (360 - alpha)" value={old === null ? '--' : `${Math.round(old)}°`} />
          <Row
            label="Difference"
            value={gap === null ? '--' : `${gap.toFixed(0)}°`}
          />
        </dl>
        <p className="mt-2.5 border-t border-outline-variant pt-2.5 text-label-md text-on-surface-variant">
          {gap === null
            ? 'Waiting for a reading.'
            : gap < 2
              ? 'The phone is level, so both agree. ROLL IT LEFT OR RIGHT and watch them diverge - that gap was the bug.'
              : `Roll the phone and this gap tracks it. The old code was off by this much.`}
        </p>
      </div>

      {/* ---- raw sensor ------------------------------------------- */}
      <div className="card mt-3">
        <p className="font-bold text-on-surface">Raw sensor</p>
        <dl className="mt-2 space-y-1.5 text-label-lg">
          <Row label="alpha (yaw)" value={raw ? `${raw.a.toFixed(1)}°` : '--'} />
          <Row label="beta (tilt)" value={raw ? `${raw.b.toFixed(1)}°` : '--'} />
          <Row label="gamma (roll)" value={raw ? `${raw.g.toFixed(1)}°` : '--'} />
          <Row label="absolute" value={raw ? (raw.abs ? 'yes' : 'NO - unusable') : '--'} />
          <Row label="absolute events" value={String(events.absolute)} />
          <Row label="plain events" value={String(events.plain)} />
        </dl>
        <p className="mt-2.5 border-t border-outline-variant pt-2.5 text-label-md text-on-surface-variant">
          {events.absolute === 0 && events.plain > 0
            ? 'This device fires only the RELATIVE event. Its alpha is not referenced to north, so no true heading is possible here.'
            : 'absolute must say yes. A relative reading is an arbitrary offset, not a compass.'}
        </p>
      </div>

      {/* ---- how to actually verify it ---------------------------- */}
      <div className="note mt-3">
        <p className="font-bold text-on-surface">To prove it</p>
        <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-label-lg text-on-surface-variant">
          <li>Open a real compass app and note which way is north.</li>
          <li>Hold this phone upright and aim the camera north. This should read near 0.</li>
          <li>Turn to face east. It should read near 90, not 270.</li>
          <li>Now ROLL the phone 30&deg; while still facing east. The heading should
              barely move - the old formula would have jumped 30&deg;.</li>
          <li>If the needle wanders while the phone is still, the magnetometer needs
              calibrating: move it in a figure of eight a few times.</li>
        </ol>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-on-surface-variant">{label}</dt>
      <dd className="tnum font-semibold text-on-surface">{value}</dd>
    </div>
  )
}
