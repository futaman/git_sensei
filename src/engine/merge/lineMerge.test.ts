import { describe, expect, it } from 'vitest'
import { mergeText } from './lineMerge.ts'

const labels = { ours: 'HEAD', theirs: 'feature' }
const lines = (...xs: string[]) => xs.map((x) => `${x}\n`).join('')

describe('mergeText', () => {
  it('離れた場所の変更は両方取り込む', () => {
    const r = mergeText(
      lines('a', 'b', 'c', 'd'),
      lines('A', 'b', 'c', 'd'),
      lines('a', 'b', 'c', 'D'),
      labels,
    )
    expect(r).toEqual({ text: lines('A', 'b', 'c', 'D'), conflicts: 0 })
  })

  it('同じ変更は1回だけ', () => {
    const r = mergeText(lines('a', 'b'), lines('a', 'B'), lines('a', 'B'), labels)
    expect(r).toEqual({ text: lines('a', 'B'), conflicts: 0 })
  })

  it('同じ行を違うように変えるとコンフリクト', () => {
    const r = mergeText(lines('a', 'b', 'c'), lines('a', 'X', 'c'), lines('a', 'Y', 'c'), labels)
    expect(r.conflicts).toBe(1)
    expect(r.text).toBe(lines('a', '<<<<<<< HEAD', 'X', '=======', 'Y', '>>>>>>> feature', 'c'))
  })

  it('接している変更もコンフリクト（git と同じ）', () => {
    const r = mergeText(lines('a', 'b', 'c'), lines('A', 'b', 'c'), lines('a', 'B', 'c'), labels)
    expect(r.conflicts).toBe(1)
    expect(r.text).toBe(
      lines('<<<<<<< HEAD', 'A', 'b', '=======', 'a', 'B', '>>>>>>> feature', 'c'),
    )
  })

  it('コンフリクトの中の共通の行は外に出す', () => {
    const r = mergeText(
      lines('x'),
      lines('same1', 'mine', 'same2'),
      lines('same1', 'theirs', 'same2'),
      labels,
    )
    expect(r.text).toBe(
      lines('same1', '<<<<<<< HEAD', 'mine', '=======', 'theirs', '>>>>>>> feature', 'same2'),
    )
  })

  it('両方が追加（base なし）', () => {
    const r = mergeText('', lines('one'), lines('two'), labels)
    expect(r.text).toBe(lines('<<<<<<< HEAD', 'one', '=======', 'two', '>>>>>>> feature'))
  })
})
