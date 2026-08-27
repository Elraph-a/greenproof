import { describe, expect, it } from 'vitest'
import { bearingDelta, compassPoint, haversine, headingFromOrientation } from './geo'

/**
 * These four functions decide whether the pilot data is usable.
 *
 * A sign error in any of them is SILENT: the app still runs, the numbers still
 * look plausible, and you only discover it weeks later when the GPS gate has
 * been passing fraud or the "face this way" arrow has been sending people to
 * the wrong side of the tree. By then T0 cannot be repeated.
 */

describe('haversine', () => {
  it('is zero for the same point', () => {
    expect(haversine(5.6505, -0.1962, 5.6505, -0.1962)).toBe(0)
  })

  it('measures a known short distance on the UG campus', () => {
    // 0.0001° of latitude ≈ 11.1 m anywhere on Earth.
    const d = haversine(5.6505, -0.1962, 5.6506, -0.1962)
    expect(d).toBeGreaterThan(10.5)
    expect(d).toBeLessThan(11.5)
  })

  it('is symmetric', () => {
    const a = haversine(5.65, -0.196, 5.66, -0.19)
    const b = haversine(5.66, -0.19, 5.65, -0.196)
    expect(a).toBeCloseTo(b, 6)
  })

  it('matches a known long distance (Accra to Kumasi ≈ 200 km)', () => {
    const d = haversine(5.6037, -0.187, 6.6885, -1.6244) / 1000
    expect(d).toBeGreaterThan(195)
    expect(d).toBeLessThan(210)
  })

  it('resolves the scale that matters — trees 3 m apart', () => {
    // If this ever returns ~0, neighbouring trees are indistinguishable and
    // the GPS gate is worthless.
    const d = haversine(5.65, -0.1962, 5.65, -0.19617)
    expect(d).toBeGreaterThan(2)
    expect(d).toBeLessThan(5)
  })
})

describe('bearingDelta', () => {
  it('is zero for identical bearings', () => {
    expect(bearingDelta(90, 90)).toBe(0)
  })

  it('takes the SHORT way across north', () => {
    // 350° → 10° is +20°, not -340°. Getting this wrong would tell a user to
    // spin almost all the way round to face a tree that is 20° to their right.
    expect(bearingDelta(350, 10)).toBe(20)
    expect(bearingDelta(10, 350)).toBe(-20)
  })

  it('is signed — positive means turn clockwise', () => {
    expect(bearingDelta(0, 90)).toBe(90)
    expect(bearingDelta(90, 0)).toBe(-90)
  })

  it('stays within (-180, 180]', () => {
    for (let a = 0; a < 360; a += 7) {
      for (let b = 0; b < 360; b += 11) {
        const d = bearingDelta(a, b)
        expect(d).toBeGreaterThan(-181)
        expect(d).toBeLessThanOrEqual(180)
      }
    }
  })
})

describe('compassPoint', () => {
  it('maps the cardinals', () => {
    expect(compassPoint(0)).toBe('N')
    expect(compassPoint(90)).toBe('E')
    expect(compassPoint(180)).toBe('S')
    expect(compassPoint(270)).toBe('W')
  })

  it('maps the intercardinals', () => {
    expect(compassPoint(45)).toBe('NE')
    expect(compassPoint(135)).toBe('SE')
    expect(compassPoint(225)).toBe('SW')
    expect(compassPoint(315)).toBe('NW')
  })

  it('wraps past 360 and handles negatives', () => {
    expect(compassPoint(360)).toBe('N')
    expect(compassPoint(359)).toBe('N')
    expect(compassPoint(-90)).toBe('W')
  })
})

/**
 * THE COMPASS BUG THAT REACHED THE FIELD.
 *
 * The old implementation was `360 - alpha`. Measured against the full
 * orientation, that formula is exactly right for a phone held upright with NO
 * ROLL - and wrong by the roll angle the moment the phone tilts left or right:
 *
 *     roll  0 deg  ->  error  0 deg
 *     roll 15 deg  ->  error 15 deg
 *     roll 30 deg  ->  error 30 deg
 *
 * Nobody holds a phone perfectly level at a tree. That is why it read fine at a
 * desk and "was misdirecting us" in the field.
 *
 * Note alpha increases ANTICLOCKWISE, so a compass heading decreases as alpha
 * rises. Writing these tests the intuitive way round produced east and west
 * swapped, which is precisely the silent sign error this file exists to catch.
 */
describe('headingFromOrientation', () => {
  const near = (got: number | null, want: number, tol = 1.5) => {
    expect(got).not.toBeNull()
    // Compare on the circle so 359.5 and 0.5 are half a degree apart.
    // Signed difference on the circle, so 359.5 and 0.5 are 1 degree apart.
    const d = Math.abs(((((got as number) - want) % 360) + 540) % 360 - 180)
    expect(d).toBeLessThan(tol)
  }

  describe('phone upright - how this app is actually used', () => {
    it('alpha 0 points the camera north', () => near(headingFromOrientation(0, 90, 0), 0))
    it('alpha 90 points the camera WEST, not east', () =>
      near(headingFromOrientation(90, 90, 0), 270))
    it('alpha 180 points the camera south', () => near(headingFromOrientation(180, 90, 0), 180))
    it('alpha 270 points the camera EAST', () => near(headingFromOrientation(270, 90, 0), 90))
  })

  describe('roll is what broke the old formula', () => {
    // `360 - alpha` would say 0 for every one of these.
    it('15 degrees of roll moves the heading 15 degrees', () =>
      near(headingFromOrientation(0, 90, 15), 345))
    it('30 degrees of roll moves the heading 30 degrees', () =>
      near(headingFromOrientation(0, 90, 30), 330))
    it('45 degrees of roll moves the heading 45 degrees', () =>
      near(headingFromOrientation(0, 90, 45), 315))
  })

  it('agrees with the old formula in the one case it was right: upright, no roll', () => {
    for (const a of [0, 45, 90, 135, 180, 225, 270, 315]) {
      near(headingFromOrientation(a, 90, 0), (360 - a) % 360)
    }
  })

  it('returns null when the camera points at the sky or the ground', () => {
    // Flat on a table, screen up: the camera points straight down and no
    // bearing is meaningful. Inventing one is the bug we just removed.
    expect(headingFromOrientation(0, 0, 0)).toBeNull()
  })

  it('a phone leaning back still reads the right quadrant', () => {
    const h = headingFromOrientation(0, 70, 0)
    expect(h).not.toBeNull()
    expect((h as number) < 45 || (h as number) > 315).toBe(true)
  })

  it('always returns a value inside [0, 360)', () => {
    for (let a = 0; a < 360; a += 23) {
      for (const b of [45, 90, 135]) {
        for (const g of [-30, 0, 30]) {
          const h = headingFromOrientation(a, b, g)
          if (h !== null) {
            expect(h).toBeGreaterThanOrEqual(0)
            expect(h).toBeLessThan(360)
          }
        }
      }
    }
  })
})
