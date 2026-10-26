// 行単位の3-wayマージ（git の xdiff merge、既定の XDL_MERGE_ZEALOUS 相当）。
// base→ours と base→theirs の差分を並べ、重なる（または接する）変更をコンフリクトにする。
// コンフリクトの中は ours と theirs をさらに比べ、共通の行を外に出して細かく分ける。
import { splitLines } from '../diff/lines.ts'

/** a[aStart, aEnd) が b[bStart, bEnd) に置き換わった */
export interface Hunk {
  aStart: number
  aEnd: number
  bStart: number
  bEnd: number
}

/** 最小の行差分（LCS）。共通の先頭・末尾を先に除いてから計算する */
export function diffLines(a: string[], b: string[]): Hunk[] {
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }
  const n = endA - start
  const m = endB - start
  // lcs[i][j] = a[start+i..endA) と b[start+j..endB) の最長共通部分列の長さ
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    const row = lcs[i] as number[]
    const next = lcs[i + 1] as number[]
    for (let j = m - 1; j >= 0; j--) {
      row[j] =
        a[start + i] === b[start + j]
          ? (next[j + 1] as number) + 1
          : Math.max(next[j] as number, row[j + 1] as number)
    }
  }
  const hunks: Hunk[] = []
  let i = 0
  let j = 0
  let open: Hunk | null = null
  const close = () => {
    if (open) hunks.push(open)
    open = null
  }
  while (i < n || j < m) {
    if (i < n && j < m && a[start + i] === b[start + j]) {
      close()
      i++
      j++
      continue
    }
    if (!open) open = { aStart: start + i, aEnd: start + i, bStart: start + j, bEnd: start + j }
    const del = i < n ? (lcs[i + 1] as number[])[j] : -1
    const ins = j < m ? (lcs[i] as number[])[j + 1] : -1
    if (j >= m || (i < n && (del as number) >= (ins as number))) {
      i++
      open.aEnd++
    } else {
      j++
      open.bEnd++
    }
  }
  close()
  return hunks
}

export interface MergeLabels {
  ours: string
  theirs: string
}

export interface MergeTextResult {
  text: string
  conflicts: number
}

type Segment =
  | { kind: 'plain'; lines: string[] }
  | { kind: 'conflict'; ours: string[]; theirs: string[] }

/** ours と theirs の両方が変えた範囲を、共通の行で分けて細かいコンフリクトにする */
function refine(ours: string[], theirs: string[]): Segment[] {
  if (ours.length === 0 || theirs.length === 0) return [{ kind: 'conflict', ours, theirs }]
  const out: Segment[] = []
  let pos = 0
  for (const h of diffLines(ours, theirs)) {
    if (h.aStart > pos) out.push({ kind: 'plain', lines: ours.slice(pos, h.aStart) })
    out.push({
      kind: 'conflict',
      ours: ours.slice(h.aStart, h.aEnd),
      theirs: theirs.slice(h.bStart, h.bEnd),
    })
    pos = h.aEnd
  }
  if (pos < ours.length) out.push({ kind: 'plain', lines: ours.slice(pos) })
  return out
}

export function mergeText(
  base: string,
  ours: string,
  theirs: string,
  labels: MergeLabels,
): MergeTextResult {
  const b = splitLines(base)
  const o = splitLines(ours)
  const t = splitLines(theirs)
  const h1 = diffLines(b, o)
  const h2 = diffLines(b, t)

  const segments: Segment[] = []
  let basePos = 0
  // 各側の「base の行番号 → その側の行番号」のずれ（これまでの変更で増減した行数）
  let off1 = 0
  let off2 = 0
  let i = 0
  let j = 0
  while (i < h1.length || j < h2.length) {
    const a = h1[i]
    const c = h2[j]
    const first = !c || (a && a.aStart <= c.aStart) ? 'ours' : 'theirs'
    const startHunk = (first === 'ours' ? a : c) as Hunk
    let gs = startHunk.aStart
    let ge = startHunk.aEnd
    const g1: Hunk[] = []
    const g2: Hunk[] = []
    if (first === 'ours') {
      g1.push(startHunk)
      i++
    } else {
      g2.push(startHunk)
      j++
    }
    // 重なる、または接する変更をまとめる（git は end == start も同じまとまりとして扱う）
    for (;;) {
      const na = h1[i]
      const nc = h2[j]
      if (na && na.aStart <= ge) {
        g1.push(na)
        ge = Math.max(ge, na.aEnd)
        gs = Math.min(gs, na.aStart)
        i++
      } else if (nc && nc.aStart <= ge) {
        g2.push(nc)
        ge = Math.max(ge, nc.aEnd)
        gs = Math.min(gs, nc.aStart)
        j++
      } else break
    }

    if (gs > basePos) segments.push({ kind: 'plain', lines: b.slice(basePos, gs) })
    const range = (group: Hunk[], off: number, side: string[]) => {
      if (group.length === 0) return { lines: side.slice(gs + off, ge + off), off }
      const firstH = group[0] as Hunk
      const lastH = group[group.length - 1] as Hunk
      const ss = firstH.bStart - (firstH.aStart - gs)
      const se = lastH.bEnd + (ge - lastH.aEnd)
      return { lines: side.slice(ss, se), off: lastH.bEnd - lastH.aEnd }
    }
    const r1 = range(g1, off1, o)
    const r2 = range(g2, off2, t)
    off1 = r1.off
    off2 = r2.off
    if (g2.length === 0) segments.push({ kind: 'plain', lines: r1.lines })
    else if (g1.length === 0) segments.push({ kind: 'plain', lines: r2.lines })
    else if (r1.lines.join('') === r2.lines.join(''))
      segments.push({ kind: 'plain', lines: r1.lines })
    else segments.push(...refine(r1.lines, r2.lines))
    basePos = ge
  }
  if (basePos < b.length) segments.push({ kind: 'plain', lines: b.slice(basePos) })

  let conflicts = 0
  const out: string[] = []
  const withNewline = (lines: string[]) => {
    for (const l of lines) out.push(l.endsWith('\n') ? l : `${l}\n`)
  }
  for (const s of segments) {
    if (s.kind === 'plain') {
      out.push(...s.lines)
      continue
    }
    conflicts++
    out.push(`<<<<<<< ${labels.ours}\n`)
    withNewline(s.ours)
    out.push('=======\n')
    withNewline(s.theirs)
    out.push(`>>>>>>> ${labels.theirs}\n`)
  }
  return { text: out.join(''), conflicts }
}
