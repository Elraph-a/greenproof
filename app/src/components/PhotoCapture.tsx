import { useRef, useState } from 'react'
import {
  isBlurry,
  preparePhoto,
  revokePreview,
  type PreparedPhoto,
} from '../lib/image'
import { useLiveCamera } from '../lib/camera'
import { DEMO } from '../lib/demo'
import { Icon } from './Icon'
import { ErrorNote, Spinner } from './ui'

/**
 * THE CAMERA IS IN THE APP NOW.
 *
 * This used to hand off to the phone's camera app via `<input type="file"
 * capture="environment">`, chosen for autofocus, exposure metering and full
 * sensor resolution. Field feedback after the July pilot was that the capture
 * step felt too distant from the user, and re-reading the trade it is clear
 * most of what we were buying is thrown away:
 *
 * lib/image.ts downscales EVERY photo to 800px on the long edge at q75 before
 * upload, and DINOv2 ViT-S/14 sees 224-518px. A 12 MP still and a 1920x1080
 * frame reach the model as the same 800px JPEG. Resolution was never the
 * variable.
 *
 * Focus and exposure ARE real, and `ImageCapture.takePhoto()` recovers them by
 * asking the camera for an actual still on the live track. See lib/camera.ts
 * for the three tiers and what happens when each is unavailable - including
 * this component's own file input, which is still here as the last one.
 *
 * The blur gate below is unchanged and is the safety net either way: it reads
 * the photo we actually stored, so it does not care which path produced it.
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

  // Only hold the camera open while it is actually on screen. A live stream
  // behind a captured photo keeps the sensor powered and the preview decoding
  // for no reason, and this flow has two of these mounted at once.
  const cam = useLiveCamera(!photo)

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

    // No live camera - permission refused, insecure context, or a device
    // without one. Hand off to the phone's camera app, which still works.
    if (!cam.ready) {
      inputRef.current?.click()
      return
    }

    setBusy(true)
    setError(null)
    setAcceptedBlur(false)
    try {
      const prepared = await preparePhoto(await cam.capture())
      if (photo) revokePreview(photo)
      onChange(prepared)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not capture')
    } finally {
      setBusy(false)
    }
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
          className="relative flex aspect-[3/4] w-full flex-col items-center justify-center overflow-hidden rounded-2xl bg-[#1a1c19] px-6 text-center text-white"
        >
          {/*
            The surface IS the viewfinder. It was a black panel with a camera
            glyph, which is a button that promises a camera; this is the camera.
            The framing guidance - brackets, prompt - now sits over the actual
            scene, which is the only place it can do any good.
          */}
          <video
            ref={cam.videoRef}
            playsInline
            muted
            // Decorative: the prompt below already says what to point at, and
            // a live feed has no alt text worth reading out.
            aria-hidden
            className="absolute inset-0 size-full object-cover"
          />
          {/* Without this the shutter and prompt sit on whatever the camera is
              pointing at - white sky in half the pilot photos. */}
          <span aria-hidden className="absolute inset-0 bg-black/30" />

          {brackets && <Brackets />}
          <span className="relative flex size-[68px] items-center justify-center rounded-full border-2 border-white/85 bg-black/20 backdrop-blur-sm">
            {busy ? <Spinner className="size-7" /> : <Icon name="camera" size={30} />}
          </span>
          <span className="relative mt-4 font-headline text-headline-md font-bold [text-shadow:0_1px_6px_rgb(0_0_0/0.6)]">
            {busy ? 'Processing…' : prompt}
          </span>
          {subPrompt && (
            <span className="relative mt-1 text-label-lg text-white/75 [text-shadow:0_1px_6px_rgb(0_0_0/0.6)]">
              {subPrompt}
            </span>
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

      {/*
        Deliberately a quiet note, not an ErrorNote. When the live camera is
        unavailable the shutter still opens the phone's camera app and the
        registration completes normally - so nothing has failed and a red panel
        would be a lie. It says what changed and why, and stops there.
      */}
      {!photo && cam.error && (
        <p className="mt-2 text-label-md text-on-surface-variant">
          {cam.error}
        </p>
      )}
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
