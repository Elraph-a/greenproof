import { useCallback, useEffect, useRef, useState } from 'react'
import { DEMO } from './demo'

/**
 * The live in-app camera, shared by registration and check-in.
 *
 * WHY THIS EXISTS AT ALL
 * Registration used to hand off to the phone's camera app via
 * `<input type="file" capture="environment">`. That works, but it throws the
 * planter out of the app mid-flow: the viewfinder is someone else's UI, our
 * framing guidance disappears, and on a slow Android the round trip out and
 * back is seconds. Field feedback after the July pilot was exactly this - the
 * capture step felt "too distant from the user".
 *
 * WHY THE OLD QUALITY ARGUMENT NO LONGER HOLDS
 * The native camera was chosen for autofocus, exposure metering and full
 * sensor resolution. Resolution turns out to be irrelevant: lib/image.ts
 * downscales EVERY photo to 800px on the long edge at q75 before upload, and
 * DINOv2 ViT-S/14 only ever sees 224-518px. A 12 MP still and a 1920x1080
 * video frame arrive at the model as the same 800px JPEG. We were paying for
 * resolution we delete.
 *
 * Focus and exposure are the real difference, and `ImageCapture.takePhoto()`
 * closes most of it: it asks the camera for an actual STILL on the same track
 * - focus lock, exposure metering, the device's own denoise - rather than
 * scraping whatever frame the video preview happened to be showing. Chrome on
 * Android supports it, which is the pilot's hardware. Where it is missing
 * (Safari/iOS) we fall back to the canvas frame, and where getUserMedia itself
 * is unavailable the caller falls back to the native file input.
 *
 * Three tiers, degrading in quality but never in ability to complete a visit:
 *   1. getUserMedia + ImageCapture.takePhoto()   - in-app, still quality
 *   2. getUserMedia + canvas frame               - in-app, preview quality
 *   3. <input type="file" capture>               - leaves the app, best quality
 *
 * A SIDE EFFECT THAT IS ACTUALLY THE POINT
 * The compass. Handing off to the native camera backgrounds the browser, so
 * `deviceorientation` stops firing and the heading we stored was the heading
 * from BEFORE the camera opened - a guess about where the phone would be
 * pointing. Capturing in-app means the heading is read at the moment of
 * capture, which is what the project's own rule 4 has always claimed we do.
 */

/** Not in TypeScript's DOM lib yet; this is the slice we use. */
interface ImageCaptureLike {
  takePhoto(): Promise<Blob>
}
type ImageCaptureCtor = new (track: MediaStreamTrack) => ImageCaptureLike

export type CameraTier = 'still' | 'frame' | 'none'

export interface LiveCamera {
  videoRef: React.RefObject<HTMLVideoElement | null>
  /** Stream is playing and a capture would succeed. */
  ready: boolean
  /** Null while starting, or once running. Set when the live path is unusable. */
  error: string | null
  /** Which of the three tiers is actually in play. Surfaced for the pitch. */
  tier: CameraTier
  /** Returns a JPEG blob. Throws if the camera is not ready. */
  capture: () => Promise<Blob>
  stop: () => void
}

export function useLiveCamera(active = true): LiveCamera {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tier, setTier] = useState<CameraTier>('none')

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => {
    if (!active) return
    // Demo mode: a desktop has no rear camera, and what is being reviewed on
    // these screens is the framing guidance, not the video feed.
    if (DEMO) {
      setReady(true)
      setTier('frame')
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('unsupported')
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            // Ask high; the browser gives what it can. This only matters on
            // the canvas-frame path - takePhoto() ignores it and uses the
            // sensor's own still resolution.
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
        const Ctor = (window as unknown as { ImageCapture?: ImageCaptureCtor })
          .ImageCapture
        setTier(Ctor ? 'still' : 'frame')
        setReady(true)
      } catch (err) {
        // Permission refused, no camera, or an insecure context. Note the
        // last one: getUserMedia needs HTTPS or localhost, so opening the dev
        // server over a plain-HTTP LAN address on a phone lands here. The
        // caller's file-input fallback keeps the visit possible either way.
        setError(
          err instanceof Error && err.name === 'NotAllowedError'
            ? 'Camera permission was refused. You can still take the photo the normal way.'
            : 'Live camera unavailable on this device. Use the normal camera below.',
        )
        setTier('none')
      }
    })()

    return () => {
      cancelled = true
      stop()
    }
  }, [active, stop])

  const capture = useCallback(async (): Promise<Blob> => {
    const track = streamRef.current?.getVideoTracks()[0]
    const Ctor = (window as unknown as { ImageCapture?: ImageCaptureCtor })
      .ImageCapture

    // Tier 1 - a real still. Wrapped because takePhoto() rejects on some
    // Android/webview combinations that still advertise the constructor, and
    // a failed shutter must never end the visit when a usable frame is sitting
    // right there in the preview.
    //
    // takePhoto() does NOT promise a JPEG. Measured against Chrome's fake
    // device it hands back image/png. That is fine and needs no conversion
    // here: lib/image.ts decodes with createImageBitmap, which reads PNG, and
    // re-encodes to JPEG q75 at 800px regardless of what came in. Worth
    // knowing before someone "fixes" it by forcing a MIME type.
    if (Ctor && track && track.readyState === 'live') {
      try {
        const blob = await new Ctor(track).takePhoto()
        if (blob.size > 0) return blob
      } catch {
        /* fall through to the frame grab */
      }
    }

    // Tier 2 - the preview frame.
    const video = videoRef.current
    if (!video || !video.videoWidth) throw new Error('Camera is not ready')
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas unavailable')
    ctx.drawImage(video, 0, 0)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Capture failed'))),
        'image/jpeg',
        // Deliberately high: this blob is an intermediate. preparePhoto
        // re-encodes it to 800px/q75, and compressing twice at q75 stacks
        // artefacts onto the exact bark detail the measurement reads.
        0.92,
      ),
    )
  }, [])

  return { videoRef, ready, error, tier, capture, stop }
}
