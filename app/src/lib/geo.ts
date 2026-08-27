/**
 * Location and compass.
 *
 * Both are on the critical path for verification, not decoration:
 *  - GPS is the gate that catches "right tree, wrong place" and, with the
 *    previous check-in's timestamp, "impossible travel speed".
 *  - Compass heading is recorded at registration so the next visit can say
 *    "stand here, face this way". Reproducing framing is the cheapest available
 *    improvement to image matching — the spike found matching partly works off
 *    the background, which only helps if the background is the same background.
 *
 * NOTE: both APIs require a secure context. They silently do nothing over plain
 * HTTP. `localhost` is exempt, which is why desktop testing misleads and the
 * phone must hit the real HTTPS deployment.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

const EARTH_RADIUS_M = 6_371_000

/** Great-circle distance in metres. */
export function haversine(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = Math.PI / 180
  const dLat = (lat2 - lat1) * toRad
  const dLng = (lng2 - lng1) * toRad
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a))
}

/** Smallest signed angle from `a` to `b`, in degrees, within (-180, 180]. */
export function bearingDelta(a: number, b: number): number {
  return ((((b - a) % 360) + 540) % 360) - 180
}

/** "N", "NE", … for a human-readable heading. */
export function compassPoint(deg: number): string {
  const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return points[Math.round(((deg % 360) + 360) % 360 / 45) % 8]!
}

// ---------------------------------------------------------------------------
// Geolocation
// ---------------------------------------------------------------------------

export interface Fix {
  lat: number
  lng: number
  /** Radius of 68% confidence, in metres, as reported by the device. */
  accuracy: number
  at: number
}

export type GeoState = 'idle' | 'locating' | 'ready' | 'denied' | 'unavailable'

/**
 * Accuracy at or below this is good enough to register.
 *
 * A consumer phone under open sky settles around 4–8 m. Under canopy it can sit
 * at 15–30 m, which is wider than the spacing between neighbouring trees — so
 * accepting a poor fix would mean registering two trees at effectively the same
 * point and making the GPS gate meaningless afterwards.
 */
export const GOOD_ACCURACY_M = 10

/** Refuse outright above this. */
export const MAX_ACCURACY_M = 25

/**
 * Watches position and keeps the BEST fix seen, not the latest.
 *
 * GPS converges: the first fix is often a 2000 m cell-tower estimate that
 * tightens over 10–30 seconds. Taking the newest reading would sometimes take a
 * worse one. We keep the tightest, and reset when the user starts a new capture.
 */
export function useGeolocation(active = true) {
  const [fix, setFix] = useState<Fix | null>(null)
  const [state, setState] = useState<GeoState>('idle')
  const bestRef = useRef<Fix | null>(null)

  const reset = useCallback(() => {
    bestRef.current = null
    setFix(null)
  }, [])

  useEffect(() => {
    if (!active) return
    if (!('geolocation' in navigator)) {
      setState('unavailable')
      return
    }

    setState('locating')
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const next: Fix = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          at: pos.timestamp,
        }
        const best = bestRef.current
        // Accept if tighter, or if the current best is stale (>30 s) — the user
        // may have walked to the next tree.
        if (!best || next.accuracy <= best.accuracy || next.at - best.at > 30_000) {
          bestRef.current = next
          setFix(next)
        }
        setState('ready')
      },
      (err) => {
        setState(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable')
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 30_000,
      },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [active])

  return { fix, state, reset }
}

// ---------------------------------------------------------------------------
// Compass
// ---------------------------------------------------------------------------

export type HeadingState =
  | 'idle'
  | 'needs-permission'
  | 'ready'
  | 'unsupported'
  | 'denied'

interface IOSDeviceOrientationEvent extends DeviceOrientationEvent {
  webkitCompassHeading?: number
  webkitCompassAccuracy?: number
}

type PermissionCapableCtor = {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

/**
 * Compass heading of the direction the BACK CAMERA points, from a raw
 * device-orientation reading.
 *
 * WHY THIS REPLACED `360 - alpha`, WHICH WAS WRONG IN THE FIELD.
 *
 * `360 - alpha` is the heading of the TOP EDGE of a phone lying FLAT. This app
 * asks people to hold the phone UPRIGHT to photograph a tree - the capture
 * screen literally says "Hold phone portrait (upright)". At that attitude
 * beta is near 90 degrees, alpha and gamma become degenerate (the classic
 * gimbal problem), and the naive formula returns a confidently wrong bearing.
 * It only agrees with reality when the phone is flat, which is never how this
 * app is used. Reported from the field as "misdirecting us. It was very bad".
 *
 * The correct calculation uses the full orientation. Build the device-to-world
 * rotation matrix from the W3C ZXY intrinsic Euler angles, then ask where the
 * camera axis ends up in world coordinates and take its compass bearing.
 *
 *   device frame   +X right, +Y top, +Z out of the screen
 *                  the back camera therefore looks along -Z
 *   world frame    +X east, +Y north, +Z up
 *
 * A useful property falls out of choosing -Z: the camera axis is fixed to the
 * phone's BODY, so screen rotation does not affect it and no
 * `screen.orientation.angle` correction is needed. Using the top edge (+Y)
 * would have required one.
 *
 * Returns null when the camera points too near straight up or down for a
 * bearing to mean anything - a phone laid flat on a table has no meaningful
 * "facing", and inventing one would be the same class of bug we just removed.
 */
export function headingFromOrientation(
  alpha: number,
  beta: number,
  gamma: number,
): number | null {
  const d = Math.PI / 180
  const cA = Math.cos(alpha * d)
  const sA = Math.sin(alpha * d)
  const cB = Math.cos(beta * d)
  const sB = Math.sin(beta * d)
  const cG = Math.cos(gamma * d)
  const sG = Math.sin(gamma * d)

  // Third column of R = Rz(alpha)·Rx(beta)·Ry(gamma) - the world-frame
  // direction of the device's +Z axis. Only this column is needed.
  const zx = cA * sG + sA * sB * cG
  const zy = sA * sG - cA * sB * cG
  const zz = cB * cG

  // The camera looks along -Z.
  const east = -zx
  const north = -zy
  const up = -zz

  // Near-vertical camera: the horizontal projection is numerically meaningless.
  // cos(80°) ≈ 0.17, so this rejects the last 10 degrees at each extreme.
  if (Math.hypot(east, north) < 0.17 && Math.abs(up) > 0.98) return null

  const deg = Math.atan2(east, north) / d
  return ((deg % 360) + 360) % 360
}

/**
 * True compass heading in degrees, 0 = north, increasing clockwise.
 *
 * Two incompatible platform behaviours:
 *  - iOS Safari fires `deviceorientation` carrying `webkitCompassHeading`,
 *    already a true heading. It requires an explicit permission grant that must
 *    originate in a user gesture — hence `request()` rather than asking on mount.
 *  - Android Chrome fires `deviceorientationabsolute` with `alpha` measured
 *    ANTICLOCKWISE from north, so the heading is `360 - alpha`. Getting this
 *    backwards is an easy and completely silent bug: the value looks plausible
 *    and is wrong except at 0° and 180°.
 */
export function useHeading(active = true) {
  const [heading, setHeading] = useState<number | null>(null)
  const [state, setState] = useState<HeadingState>('idle')

  const attach = useCallback(() => {
    const handle = (ev: DeviceOrientationEvent) => {
      const e = ev as IOSDeviceOrientationEvent

      if (typeof e.webkitCompassHeading === 'number') {
        setHeading(((e.webkitCompassHeading % 360) + 360) % 360)
        setState('ready')
        return
      }

      // Only absolute readings are compass-referenced. A relative `alpha` is an
      // arbitrary offset from wherever the phone happened to be and would give
      // us a confidently wrong bearing.
      if (
        e.absolute &&
        typeof e.alpha === 'number' &&
        typeof e.beta === 'number' &&
        typeof e.gamma === 'number'
      ) {
        // Full orientation, not just alpha. See headingFromOrientation: the
        // old `360 - alpha` was the heading of a FLAT phone's top edge, and
        // this app is used with the phone held upright.
        const h = headingFromOrientation(e.alpha, e.beta, e.gamma)
        // null means the camera is pointing near-vertically, where no bearing
        // is meaningful. Keep the last good reading rather than writing a
        // fabricated one.
        if (h !== null) {
          setHeading(h)
          setState('ready')
        }
      }
    }

    // `deviceorientationabsolute` FIRST and, where it exists, ONLY.
    //
    // Android fires both. The plain `deviceorientation` event can arrive with
    // absolute=true but an alpha referenced to an arbitrary starting attitude
    // rather than to magnetic north, so listening to both let a relative
    // reading overwrite a good absolute one a few times a second. The heading
    // then drifted while the phone was perfectly still - which is what "it was
    // misdirecting us" looks like from the outside.
    const hasAbsolute = 'ondeviceorientationabsolute' in window
    if (hasAbsolute) {
      window.addEventListener('deviceorientationabsolute', handle as EventListener)
    } else {
      window.addEventListener('deviceorientation', handle as EventListener)
    }
    return () => {
      window.removeEventListener('deviceorientationabsolute', handle as EventListener)
      window.removeEventListener('deviceorientation', handle as EventListener)
    }
  }, [])


  /** Call from a click handler — iOS ignores it otherwise. */
  const request = useCallback(async () => {
    const ctor = window.DeviceOrientationEvent as unknown as PermissionCapableCtor
    if (typeof ctor?.requestPermission === 'function') {
      try {
        const res = await ctor.requestPermission()
        if (res !== 'granted') {
          setState('denied')
          return false
        }
      } catch {
        setState('denied')
        return false
      }
    }
    setState('idle')
    return true
  }, [])

  useEffect(() => {
    if (!active) return
    if (!('DeviceOrientationEvent' in window)) {
      setState('unsupported')
      return
    }
    const ctor = window.DeviceOrientationEvent as unknown as PermissionCapableCtor
    if (typeof ctor?.requestPermission === 'function' && state === 'idle' && heading === null) {
      // iOS: wait for the user gesture that calls request().
      setState('needs-permission')
    }
    return attach()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, attach])

  return { heading, state, request }
}
