import { describe, expect, it } from 'vitest'
import type { CommitNode } from '../../../engine/index.ts'
import { layoutGraph } from './layout.ts'

const c = (oid: string, ...parents: string[]): CommitNode => ({
  oid,
  short: oid,
  parents,
  subject: oid,
  author: 'a',
  timestamp: 0,
})

describe('layoutGraph', () => {
  it('一直線の履歴は1レーンに古い順で並ぶ', () => {
    const g = layoutGraph([c('c3', 'c2'), c('c2', 'c1'), c('c1')])
    expect(g.placed.map((p) => [p.commit.oid, p.column, p.lane])).toEqual([
      ['c3', 2, 0],
      ['c2', 1, 0],
      ['c1', 0, 0],
    ])
    expect(g.lanes).toBe(1)
  })

  it('分岐したブランチは別のレーンに置き、分岐元でつながる', () => {
    // main: c1 - c2 - m3 / feature: c2 - f3 - f4
    const g = layoutGraph([c('f4', 'f3'), c('m3', 'c2'), c('f3', 'c2'), c('c2', 'c1'), c('c1')])
    const lane = Object.fromEntries(g.placed.map((p) => [p.commit.oid, p.lane]))
    expect(lane.f4).toBe(lane.f3)
    expect(lane.m3).not.toBe(lane.f3)
    expect(lane.c2).toBe(0)
    expect(g.lanes).toBe(2)
    expect(g.edges).toHaveLength(4)
  })

  it('マージコミットは2本の辺を持つ', () => {
    const g = layoutGraph([c('m', 'a', 'b'), c('b', 'base'), c('a', 'base'), c('base')])
    expect(g.edges.filter((e) => e.from.column === 3)).toHaveLength(2)
  })
})
