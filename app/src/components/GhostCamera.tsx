import { useCallback, useEffect, useRef, useState } from 'react'
import { preparePhoto, type PreparedPhoto } from '../lib/image'
import { DEMO } from '../lib/demo'
import { Icon } from './Icon'
import { ErrorNote, Spinner } from './ui'

/**
 * Live camera with the PREVIOUS visit's photo faintly overlaid.
 *
 * This is the one screen that has to use getUserMedia rather than the phone's
 * native camera app. Registration uses the native camera because it gives
 * autofocus and full sensor resolution for free (see PhotoCapture) - but the
 * native camera cannot draw anything on its viewfinder, and the whole point here
 * is to line the new shot up against the old one.
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
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [opacity, setOpacity] = useState(0.4)
  const [error, setError] = useState<string | null>(null)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => {
    // Demo mode: a desktop has no rear camera, and the point of reviewing this
    // screen is the ghost overlay and the framing aids, not the video feed.
    if (DEMO) {
      setReady(true)
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            // Ask for a high frame; the browser gives what it can. Below ~1280
            // the close-up loses the bark detail the measurement depends on.
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        setReady(true)
      } catch (err) {
        // Permission refused, no camera, or insecure context. The file-input
        // fallback below keeps the check-in possible - we lose the overlay, not
        // the visit. Degrade, don't break.
        setError(
          err instanceof Error && err.name === 'NotAllowedError'
            ? 'Camera permission was refused. You can still take the photo the normal way.'
            : 'Live camera unavailable on this device. Use the normal camera below.',
        )
      }
    })()

    return () => {
      cancelled = true
      stop()
    }
  }, [stop])

  async function shoot() {
    if (DEMO) {
      onCaptureStart?.()
      setBusy(true)
      try {
        const res = await fetch('/demo/tree2.jpg')
        const file = new File([await res.blob()], 'demo.jpg', { type: 'image/jpeg' })
        onCapture(await preparePhoto(file))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load the demo photo')
      } finally {
        setBusy(false)
      }
      return
    }

    const video = videoRef.current
    if (!video || !ready) return
    onCaptureStart?.()
    setBusy(true)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas unavailable')
      ctx.drawImage(video, 0, 0)

      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Capture failed'))),
          'image/jpeg',
          0.92,
        ),
      )
      // Straight through the same resize + sharpness pipeline as registration,
      // so blur_score means the same thing in both flows and the two are
      // comparable in the data.
      onCapture(await preparePhoto(blob))
      stop()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not capture')
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
      setError(err instanceof Error ? err.message : 'Could not read that photo')
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
            reproduce a framing - the ghost tells you what to match, the grid
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
