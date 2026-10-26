import { describe, expect, it } from 'vitest'
import { hasMarkers, resolveConflict } from './resolveConflict.ts'

const text = [
  'export function calcFee(amount: number): number {\n',
  '<<<<<<< HEAD\n',
  '  const rate = 0.035\n',
  '  return Math.floor(amount * rate)\n',
  '=======\n',
  '  const rate = 0.036\n',
  '  return Math.round(amount * rate)\n',
  '>>>>>>> 1a2b3c4\n',
  '}\n',
].join('')

describe('resolveConflict', () => {
  it('自分の側（HEAD）を残す', () => {
    expect(resolveConflict(text, 'ours')).toBe(
      'export function calcFee(amount: number): number {\n  const rate = 0.035\n  return Math.floor(amount * rate)\n}\n',
    )
  })

  it('取り込む側を残す', () => {
    expect(resolveConflict(text, 'theirs')).toBe(
      'export function calcFee(amount: number): number {\n  const rate = 0.036\n  return Math.round(amount * rate)\n}\n',
    )
  })

  it('印の有無', () => {
    expect(hasMarkers(text)).toBe(true)
    expect(hasMarkers(resolveConflict(text, 'ours'))).toBe(false)
  })
})
