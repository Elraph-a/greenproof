import { useRef, useState } from 'react'
import {
  isBlurry,
  preparePhoto,
  revokePreview,
  type PreparedPhoto,
} from '../lib/image'
import { DEMO } from '../lib/demo'
import { Icon } from './Icon'
import { ErrorNote, Spinner } from './ui'

/**
 * WHY THE NATIVE CAMERA AND NOT getUserMedia
 *
 * `<input type="file" capture="environment">` hands off to the phone's own
 * camera app, which buys autofocus, exposure metering, HDR and full sensor
 * resolution for free on every Android in Ghana. A getUserMedia <video> frame is
 * fixed-exposure, often soft, and lower resolution — and a soft close-up is
 * exactly what wrecks both the blur gate and the trunk measurement.
 *
 * The cost is that we cannot draw a ghost overlay on the live view. That only
 * matters at CHECK-IN, which has its own GhostCamera component. Registration has
 * no previous photo to align against, so it takes the quality instead.
 *
 * Built to docs/design/v2/03-06: a large near-black capture surface, the prompt
 * centred inside it, and the captured state replacing it in place with a Retake
 * pill rather than pushing the button row down the screen.
 */

interface Props {
  label: string
  prompt: string
  subPrompt?: string
  /** Corner brackets — the close-up frames the trunk plus the marker card. */
  brackets?: boolean
  photo: PreparedPhoto | null
  onChange: (photo: PreparedPhoto | null) => void
  /**
   * Fired the instant the shutter is tapped, BEFORE the camera app opens — the
   * only moment the compass can be trusted, since handing off to the native
   * camera backgrounds the browser and deviceorientation events stop arriving.
   */
  onCaptureStart?: () => void
  /** Which seeded photo demo mode should load for this slot. */
  demoPhoto?: number
}

export function PhotoCapture({
  label,
  prompt,
  subPrompt,
  brackets = false,
  photo,
  onChange,
  onCaptureStart,
  demoPhoto = 1,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [acceptedBlur, setAcceptedBlur] = useState(false)

  async function openCamera() {
    onCaptureStart?.()

    // On a desktop in demo mode there is no camera and a file picker would stop
    // the walkthrough dead. Load a seeded photo instead so the whole flow can be
    // clicked through while reviewing the design.
    if (DEMO) {
      setBusy(true)
      setError(null)
      try {
        const res = await fetch(`/demo/tree${demoPhoto}.jpg`)
        const blob = await res.blob()
        const file = new File([blob], `demo${demoPhoto}.jpg`, { type: 'image/jpeg' })
        const prepared = await preparePhoto(file)
        if (photo) revokePreview(photo)
        onChange(prepared)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load the demo photo')
      } finally {
        setBusy(false)
      }
      return
    }

    inputRef.current?.click()
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset immediately: retaking the SAME file twice fires no change event
    // otherwise, and the shutter appears dead.
    e.target.value = ''
    if (!file) return

    setBusy(true)
    setError(null)
    setAcceptedBlur(false)
    try {
      const prepared = await preparePhoto(file)
      if (photo) revokePreview(photo)
      onChange(prepared)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that photo')
    } finally {
      setBusy(false)
    }
  }

  const blurry = photo ? isBlurry(photo) : false

  return (
    <div className="flex flex-col">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        className="hidden"
        aria-label={label}
      />

      {!photo ? (
        <button
          type="button"
          onClick={() => void openCamera()}
          disabled={busy}
          className="relative flex aspect-[3/4] w-full flex-col items-center justify-center rounded-2xl bg-[#1a1c19] px-6 text-center text-white"
        >
          {brackets && <Brackets />}
          <span className="flex size-[68px] items-center justify-center rounded-full border-2 border-white/85">
            {busy ? <Spinner className="size-7" /> : <Icon name="camera" size={30} />}
          </span>
          <span className="mt-4 font-headline text-headline-md font-bold">
            {busy ? 'Processing…' : prompt}
          </span>
          {subPrompt && (
            <span className="mt-1 text-label-lg text-white/60">{subPrompt}</span>
          )}
        </button>
      ) : (
        <div className="relative overflow-hidden rounded-2xl">
          <img
            src={photo.previewUrl}
            alt={label}
            className="block aspect-[3/4] w-full object-cover"
          />

          <button
            type="button"
            onClick={() => void openCamera()}
            className="absolute top-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-label-lg font-semibold text-white backdrop-blur"
          >
            <Icon name="refresh" size={14} />
            Retake
          </button>

          <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-[var(--color-verified)] px-3 py-1.5 text-label-md font-bold text-white">
            <Icon name="check-circle" size={14} />
            {blurry && !acceptedBlur ? 'Captured' : 'Photo captured'}
          </span>

          <span className="tnum absolute right-3 bottom-3 rounded-full bg-black/70 px-2.5 py-1.5 text-label-md font-semibold text-white backdrop-blur">
            sharpness {Math.round(photo.blurScore)}
          </span>
        </div>
      )}

      {photo && blurry && !acceptedBlur && (
        <div className="note-warn mt-3">
          <div className="flex items-center gap-2">
            <Icon name="warning" size={18} />
            <p className="font-headline text-headline-md font-bold">
              This looks blurry
            </p>
          </div>
          <p className="mt-1 text-label-lg">
            Hold still, tap the tree on screen to focus, and try again. A soft
            photo scores badly at every future check-in on this tree.
          </p>

          {/*
            The Stitch design made "Use photo anyway" the PRIMARY action.
            Swapped deliberately: a blurry registration photo degrades every
            later comparison against this tree, and it cannot be retaken once
            you have walked away. The easy path should be the correct one.
          */}
          <button
            type="button"
            className="btn btn-primary btn-block mt-3"
            onClick={() => void openCamera()}
          >
            Retake
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-block mt-1"
            onClick={() => setAcceptedBlur(true)}
          >
            Use it anyway
          </button>
        </div>
      )}

      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  )
}

/** Framing guides for the close-up — the trunk and the card must both fit. */
function Brackets() {
  const c = 'absolute size-7 border-white/45'
  return (
    <>
      <span className={`${c} top-4 left-4 border-t-2 border-l-2 rounded-tl`} />
      <span className={`${c} top-4 right-4 border-t-2 border-r-2 rounded-tr`} />
      <span className={`${c} bottom-4 left-4 border-b-2 border-l-2 rounded-bl`} />
      <span className={`${c} right-4 bottom-4 border-r-2 border-b-2 rounded-br`} />
    </>
  )
}
