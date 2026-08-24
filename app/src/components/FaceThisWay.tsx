import { bearingDelta, compassPoint } from '../lib/geo'
import { Icon } from './Icon'

/**
 * "Stand here and face this way."
 *
 * Points the user back to the bearing recorded when the tree was registered.
 * This exists to SERVE THE GHOST OVERLAY: squaring up with a compass is coarse
 * and instant, aligning a faint previous photo is precise but fiddly. Doing the
 * coarse step first turns the precise step from a minute into five seconds.
 *
 * Reproducing framing is the cheapest available improvement to the weakest
 * signal in the system.
 */

/** Within this many degrees, close enough - phone compasses are not better. */
export const ALIGNED_WITHIN_DEG = 15

interface Props {
  target: number | null
  current: number | null
}

export function FaceThisWay({ target, current }: Props) {
  if (target === null) {
    return (
      <div className="card">
        <p className="font-bold text-on-surface">No direction recorded</p>
        <p className="mt-1 text-on-surface-variant">
          This tree was registered without a compass reading. Match the previous
          photo on the next screen instead. That still works.
        </p>
      </div>
    )
  }

  if (current === null) {
    return (
      <div className="card">
        <p className="flex items-center gap-2 font-bold text-on-surface">
          <Icon name="compass" size={22} className="text-primary" />
          Face {compassPoint(target)} ({Math.round(target)}°)
        </p>
        <p className="mt-1 text-on-surface-variant">
          No compass on this device, so we can't tell you when you're aligned.
          Line up the faint previous photo on the next screen instead.
        </p>
      </div>
    )
  }

  const delta = bearingDelta(current, target)
  const aligned = Math.abs(delta) <= ALIGNED_WITHIN_DEG

  return (
    <div
      className={`card border-2 ${aligned ? 'border-[var(--color-verified)]' : 'border-outline-variant'}`}
    >
      <div className="flex flex-col items-center">
        <div
          className={`relative flex size-44 items-center justify-center rounded-full border-4 ${
            aligned ? 'border-[var(--color-verified)]' : 'border-outline-variant'
          }`}
        >
          {/* The arrow rotates by the DELTA, not the absolute bearing, so "up"
              on screen always means "straight ahead of you". Showing the raw
              bearing would require the user to do the subtraction themselves. */}
          <svg
            viewBox="0 0 100 100"
            className="size-32 transition-transform duration-150"
            style={{ transform: `rotate(${delta}deg)` }}
            aria-hidden
          >
            <polygon
              points="50,8 68,62 50,50 32,62"
              fill={
                aligned ? 'var(--color-verified)' : 'var(--color-tertiary-container)'
              }
            />
          </svg>
          {aligned && (
            <span className="chip chip-verified absolute -bottom-2">
              <Icon name="check" size={14} />
              Aligned
            </span>
          )}
        </div>

        <p className="mt-stack-sm text-center font-headline text-headline-md font-bold text-on-surface">
          {aligned
            ? 'Hold it there'
            : `Turn ${delta > 0 ? 'right' : 'left'} ${Math.abs(Math.round(delta))}°`}
        </p>
        <p className="text-label-lg text-on-surface-variant">
          Target {compassPoint(target)} · {Math.round(target)}° · facing{' '}
          {Math.round(current)}°
        </p>
      </div>
    </div>
  )
}
