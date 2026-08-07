import { describe, expect, it } from 'vitest'
import { nextTag } from './tags'

describe('nextTag', () => {
  it('increments a plain number', () => {
    expect(nextTag('7')).toBe('8')
    expect(nextTag('39')).toBe('40')
  })

  it('preserves zero padding', () => {
    expect(nextTag('001')).toBe('002')
    expect(nextTag('017')).toBe('018')
    expect(nextTag('009')).toBe('010')
  })

  it('does not truncate when a carry needs an extra digit', () => {
    // The padStart must not clip: 099 → 100, never 00.
    expect(nextTag('099')).toBe('100')
    expect(nextTag('9')).toBe('10')
  })

  it('keeps a non-numeric prefix', () => {
    expect(nextTag('A12')).toBe('A13')
    expect(nextTag('UG-007')).toBe('UG-008')
  })

  it('leaves anything without a trailing number alone', () => {
    expect(nextTag('')).toBe('')
    expect(nextTag('abc')).toBe('abc')
  })

  it('only advances the TRAILING number', () => {
    // "plot 3, tree 09" must not become "plot 4, tree 09".
    expect(nextTag('3-09')).toBe('3-10')
  })
})
