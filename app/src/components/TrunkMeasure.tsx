import { useRef, useState } from 'react'

/**
 * Tap the left edge of the trunk, then the right edge.
 *
 * DELIBERATELY MANUAL. Finding trunk edges automatically against a messy
 * background — grass, other trunks, dappled shade — is unreliable, and an
 * automatic measurement that is confidently wrong is worse than no measurement.
 * Two taps take two seconds and it is still a real metrological observation.
 *
 * Measure at roughly 1.3 m from the ground: that is diameter at breast height,
 * the standard every forestry dataset in the world uses, which is what makes
 * the number comparable to anything outside this project.
 *
 * The component records normalised tap positions ONLY. Converting pixels to
 * millimetres needs the ArUco marker's scale and happens server-side — see
 * migration 0005 for why that split is a security boundary and not just tidiness.
 */

export interface TrunkTaps {
  left: { x: number; y: number }
  right: { x: number; y: number }
}

interface Props {
  imageUrl: string
  taps: TrunkTaps | null
  onChange: (taps: TrunkTaps | null) => void
}

export function TrunkMeasure({ imageUrl, taps, onChange }: Props) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null)

  function handleTap(e: React.PointerEvent<HTMLDivElement>) {
    const box = boxRef.current
    if (!box) return
    const r = box.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))

    if (taps) {
      // Already have both — a tap starts over rather than silently moving one
      // of them, which is ambiguous when the two markers are close together.
      onChange(null)
      setPending({ x, y })
      return
    }
    if (!pending) {
      setPending({ x, y })
      return
    }
    // Order by x so "left" is genuinely the left edge no matter which the user
    // tapped first.
    const [a, b] = pending.x <= x ? [pending, { x, y }] : [{ x, y }, pending]
    onChange({ left: a, right: b })
    setPending(null)
  }

  const widthFraction = taps ? Math.abs(taps.right.x - taps.left.x) : null

  return (
    <div>
      <div
        ref={boxRef}
        onPointerDown={handleTap}
        className="relative touch-none overflow-hidden rounded-lg border-[1.5px] border-outline-variant select-none"
      >
        <img src={imageUrl} alt="Close-up of the trunk" className="block w-full" />

        {pending && <Marker x={pending.x} y={pending.y} label="1" />}
        {taps && (
          <>
            <Marker x={taps.left.x} y={taps.left.y} label="L" />
            <Marker x={taps.right.x} y={taps.right.y} label="R" />
            <svg
              className="pointer-events-none absolute inset-0 size-full"
              aria-hidden
            >
              <line
                x1={`${taps.left.x * 100}%`}
                y1={`${taps.left.y * 100}%`}
                x2={`${taps.right.x * 100}%`}
                y2={`${taps.right.y * 100}%`}
                stroke="var(--color-primary-fixed-dim)"
                strokeWidth={3}
              />
            </svg>
          </>
        )}
      </div>

      <div className="mt-stack-sm">
        {!pending && !taps && (
          <p className="font-bold text-on-surface">
            Tap the <strong>left edge</strong> of the trunk.
          </p>
        )}
        {pending && (
          <p className="font-bold text-on-surface">
            Now tap the <strong>right edge</strong>.
          </p>
        )}
        {taps && (
          <div className="flex items-center justify-between gap-3">
            <p className="font-bold text-primary">
              ✓ Marked. {(widthFraction! * 100).toFixed(1)}% of frame width
            </p>
            <button
              type="button"
              className="btn btn-ghost px-4"
              onClick={() => {
                onChange(null)
                setPending(null)
              }}
            >
              Start again
            </button>
          </div>
        )}
        <p className="mt-1.5 text-label-lg text-on-surface-variant">
          The exact width in millimetres is worked out from your marker card
          after upload. The app never calculates it on your phone.
        </p>
      </div>
    </div>
  )
}

function Marker({ x, y, label }: { x: number; y: number; label: string }) {
  return (
    <span
      className="pointer-events-none absolute flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-primary text-xs font-bold text-white shadow"
      style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
    >
      {label}
    </span>
  )
}
