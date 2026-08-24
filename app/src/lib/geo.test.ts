import { describe, expect, it } from 'vitest'
import { bearingDelta, compassPoint, haversine } from './geo'

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
