import { useRef, useState } from 'react'
import { preparePhoto, type PreparedPhoto } from '../lib/image'
import { useLiveCamera } from '../lib/camera'
import { DEMO } from '../lib/demo'
import { Icon } from './Icon'
import { ErrorNote, Spinner } from './ui'

/**
 * Live camera with the PREVIOUS visit's photo faintly overlaid.
 *
 * The camera itself is `useLiveCamera` - the same engine registration now
 * uses. This screen's addition is the overlay: the native camera app cannot
 * draw anything on its viewfinder, and the whole point here is to line the new
 * shot up against the old one.
 *
 * WHY IT IS WORTH THE QUALITY COST
 * The spike found that wide-shot matching works substantially off the
 * BACKGROUND, not the tree. That only helps if the background is framed the same
 * way twice. Reproducing framing is the single cheapest available improvement to
 * the weakest signal in the system, and a ghost overlay is how a person does it
 * without instruction.
 *
 * Compass heading gets them facing roughly right; the ghost gets them precise.
 */

interface Props {
  /** Signed URL of the previous visit's photo. */
  ghostUrl: string | null
  label: string
  instruction: string
  onCapture: (photo: PreparedPhoto) => void
  onCaptureStart?: () => void
}

export function GhostCamera({
  ghostUrl,
  label,
  instruction,
  onCapture,
  onCaptureStart,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const { videoRef, ready, error: camError, capture, stop } = useLiveCamera()

  const [busy, setBusy] = useState(false)
  const [opacity, setOpacity] = useState(0.4)
  const [shotError, setShotError] = useState<string | null>(null)
  const error = shotError ?? camError

  async function shoot() {
    if (DEMO) {
      onCaptureStart?.()
      setBusy(true)
      try {
        const res = await fetch('/demo/tree2.jpg')
        const file = new File([await res.blob()], 'demo.jpg', { type: 'image/jpeg' })
        onCapture(await preparePhoto(file))
      } catch (err) {
        setShotError(err instanceof Error ? err.message : 'Could not load the demo photo')
      } finally {
        setBusy(false)
      }
      return
    }

    if (!ready) return
    onCaptureStart?.()
    setBusy(true)
    try {
      // Straight through the same resize + sharpness pipeline as registration,
      // so blur_score means the same thing in both flows and the two stay
      // comparable in the data.
      onCapture(await preparePhoto(await capture()))
      stop()
    } catch (err) {
      setShotError(err instanceof Error ? err.message : 'Could not capture')
    } finally {
      setBusy(false)
    }
  }

  async function handleFallbackFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    onCaptureStart?.()
    setBusy(true)
    try {
      onCapture(await preparePhoto(file))
    } catch (err) {
      setShotError(err instanceof Error ? err.message : 'Could not read that photo')
    } finally {
      setBusy(false)
    }
  }

  const showGhost = Boolean(ghostUrl) && ready && opacity > 0

  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl bg-[#1a1c19]">
        <video
          ref={videoRef}
          playsInline
          muted
          className="block w-full"
          style={{ aspectRatio: '3 / 4', objectFit: 'cover' }}
        />

        {showGhost && (
          <img
            src={ghostUrl!}
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-0 size-full object-cover"
            style={{ opacity }}
          />
        )}

        {/* Rule-of-thirds grid. Cheap, and it is what people actually use to
            reproduce a framing — the ghost tells you what to match, the grid
            tells you whether you are level. */}
        {ready && (
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            <div className="absolute top-1/3 right-0 left-0 h-px bg-white/20" />
            <div className="absolute top-2/3 right-0 left-0 h-px bg-white/20" />
            <div className="absolute top-0 bottom-0 left-1/3 w-px bg-white/20" />
            <div className="absolute top-0 bottom-0 left-2/3 w-px bg-white/20" />
          </div>
        )}

        {ghostUrl && ready && (
          <button
            type="button"
            onClick={() => setOpacity((o) => (o > 0 ? 0 : 0.4))}
            className={`absolute top-3 right-3 rounded-full px-3 py-1.5 text-label-md font-bold backdrop-blur ${
              opacity > 0 ? 'bg-white text-[#1a1c19]' : 'bg-black/60 text-white'
            }`}
          >
            Ghost
          </button>
        )}

        {ghostUrl && ready && opacity > 0 && (
          <input
            aria-label="Previous photo visibility"
            type="range"
            min={0}
            max={0.8}
            step={0.05}
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
            className="absolute top-14 right-3 w-24 accent-white"
          />
        )}

        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-white">
            <Spinner className="size-8" />
          </div>
        )}

        {ready && (
          <div className="absolute right-3 bottom-3 left-3 rounded-lg bg-black/65 px-3 py-2 backdrop-blur">
            <p className="text-label-md text-white/85">{instruction}</p>
          </div>
        )}
      </div>

      {ready && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            aria-label={`Take ${label.toLowerCase()}`}
            disabled={busy}
            onClick={() => void shoot()}
            className="flex size-[72px] items-center justify-center rounded-full bg-primary text-on-primary ring-4 ring-primary/20 transition-transform active:scale-95 disabled:opacity-60"
          >
            {busy ? <Spinner className="size-7" /> : <Icon name="camera" size={28} />}
          </button>
        </div>
      )}

      {error && (
        <>
          <ErrorNote>{error}</ErrorNote>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFallbackFile}
          />
          <button
            type="button"
            className="btn btn-secondary btn-block mt-stack-sm"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? <Spinner /> : 'Use the normal camera'}
          </button>
        </>
      )}
    </div>
  )
}
