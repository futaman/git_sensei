// コミットグラフの配置。古いコミットが左、新しいコミットが右。分岐はレーン（行）を分ける。
import type { CommitNode } from '../../../engine/index.ts'

export interface PlacedCommit {
  commit: CommitNode
  /** 左からの列（0 が一番古い） */
  column: number
  /** 上からのレーン */
  lane: number
}

export interface Edge {
  from: { column: number; lane: number }
  to: { column: number; lane: number }
}

export interface GraphLayout {
  placed: PlacedCommit[]
  edges: Edge[]
  columns: number
  lanes: number
}

/**
 * commits は「子が親より前」の順（新しい順）。各コミットは、自分を親として待っている
 * レーンがあればそこに入り、なければ空いているレーンを使う
 */
export function layoutGraph(commits: CommitNode[]): GraphLayout {
  const lanes: (string | null)[] = []
  const laneOf = new Map<string, number>()

  for (const c of commits) {
    let lane = lanes.indexOf(c.oid)
    if (lane === -1) {
      lane = lanes.indexOf(null)
      if (lane === -1) lane = lanes.length
    }
    // 同じコミットを待っていた他のレーンは、ここで合流して空く
    for (let i = 0; i < lanes.length; i++) if (lanes[i] === c.oid) lanes[i] = null
    laneOf.set(c.oid, lane)

    const [first, ...rest] = c.parents
    lanes[lane] = first ?? null
    for (const p of rest) {
      if (lanes.includes(p)) continue
      const free = lanes.indexOf(null)
      if (free === -1) lanes.push(p)
      else lanes[free] = p
    }
  }

  const n = commits.length
  const placed = commits.map((commit, i) => ({
    commit,
    column: n - 1 - i,
    lane: laneOf.get(commit.oid) ?? 0,
  }))
  const pos = new Map(placed.map((p) => [p.commit.oid, { column: p.column, lane: p.lane }]))
  const edges: Edge[] = []
  for (const p of placed) {
    for (const parent of p.commit.parents) {
      const to = pos.get(parent)
      if (to) edges.push({ from: { column: p.column, lane: p.lane }, to })
    }
  }
  const usedLanes = placed.reduce((m, p) => Math.max(m, p.lane + 1), 0)
  return { placed, edges, columns: n, lanes: usedLanes }
}
