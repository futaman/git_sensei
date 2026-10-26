import { useEffect, useMemo, useRef } from 'react'
import type { RepoView } from '../../../engine/index.ts'
import { layoutGraph } from './layout.ts'

const COL_W = 96
const R = 10
const LABEL_H = 18
const LABEL_GAP = 4
/** ノードの下のハッシュとメッセージに使う高さ */
const CAPTION_H = 44

interface Label {
  text: string
  kind: 'head' | 'current' | 'branch' | 'remote'
}

function labelsByCommit(view: RepoView): Map<string, Label[]> {
  const map = new Map<string, Label[]>()
  const push = (oid: string, label: Label) => map.set(oid, [...(map.get(oid) ?? []), label])
  if (view.branch === null && view.head) push(view.head, { text: 'HEAD', kind: 'head' })
  for (const b of view.branches) {
    push(
      b.oid,
      b.name === view.branch
        ? { text: `HEAD → ${b.name}`, kind: 'current' }
        : { text: b.name, kind: 'branch' },
    )
  }
  // origin/main など：最後に fetch したときに、リモートのブランチがどこを指していたか
  for (const r of view.remoteBranches) push(r.oid, { text: r.name, kind: 'remote' })
  return map
}

/** 11px のフォントでのおおよその幅。全角は半角の倍で数える */
function labelWidth(text: string): number {
  let w = 0
  for (const ch of text) w += (ch.codePointAt(0) ?? 0) <= 0xff ? 6.6 : 11
  return Math.max(Math.ceil(w) + 14, 36)
}

const LABEL_STYLE: Record<Label['kind'], string> = {
  head: 'fill-rose-500',
  current: 'fill-emerald-600',
  branch: 'fill-sky-600',
  remote: 'fill-violet-500',
}

export function CommitGraph({ view }: { view: RepoView | null }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const layout = useMemo(() => (view ? layoutGraph(view.commits) : null), [view])
  const labels = useMemo(() => (view ? labelsByCommit(view) : new Map<string, Label[]>()), [view])

  // グラフが変わったら、最新のコミットがある右端を見せる（依存は変化のきっかけとして使う）
  // biome-ignore lint/correctness/useExhaustiveDependencies: 上のとおり
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [layout])

  if (!view) {
    return <Empty text="git init すると、ここにコミットの履歴が表示されます" />
  }
  if (!layout || layout.placed.length === 0) {
    return (
      <Empty
        text={`まだコミットはありません（ブランチ ${view.branch ?? '?'} は最初のコミットを待っています）`}
      />
    )
  }

  // ラベルが重ならないように、いちばん多く積まれるラベルの数から余白を決める
  const maxStack = Math.max(1, ...[...labels.values()].map((ls) => ls.length))
  const labelSpace = maxStack * (LABEL_H + LABEL_GAP) + 8
  const widest = Math.max(0, ...[...labels.values()].flat().map((l) => labelWidth(l.text)))
  const padX = Math.max(48, widest / 2 + 8)
  const laneH = labelSpace + R * 2 + CAPTION_H
  const x = (column: number) => padX + column * COL_W
  const y = (lane: number) => labelSpace + R + 8 + lane * laneH

  const width = x(layout.columns - 1) + padX
  const height = y(layout.lanes - 1) + R + CAPTION_H

  return (
    <div ref={scrollRef} className="h-full overflow-auto">
      <svg width={width} height={height} role="img" aria-label="コミットグラフ">
        <title>コミットグラフ</title>
        {layout.edges.map((e) => {
          const x1 = x(e.to.column)
          const y1 = y(e.to.lane)
          const x2 = x(e.from.column)
          const y2 = y(e.from.lane)
          const d =
            y1 === y2
              ? `M ${x1} ${y1} L ${x2} ${y2}`
              : `M ${x1} ${y1} C ${x1 + COL_W * 0.7} ${y1}, ${x2 - COL_W * 0.7} ${y2}, ${x2} ${y2}`
          return (
            <path
              key={`${e.from.column}-${e.to.column}-${e.from.lane}`}
              d={d}
              className="fill-none stroke-slate-400"
              strokeWidth={2}
            />
          )
        })}
        {layout.placed.map(({ commit, column, lane }) => {
          const isHead = commit.oid === view.head
          const ls = labels.get(commit.oid) ?? []
          return (
            <g key={commit.oid} transform={`translate(${x(column)} ${y(lane)})`}>
              <title>{`${commit.short} ${commit.subject}\n${commit.author}`}</title>
              {ls.map((l, i) => {
                const w = labelWidth(l.text)
                const top = -R - 8 - (i + 1) * (LABEL_H + LABEL_GAP) + LABEL_GAP
                return (
                  <g key={l.text} transform={`translate(${-w / 2} ${top})`}>
                    <rect width={w} height={LABEL_H} rx={4} className={LABEL_STYLE[l.kind]} />
                    <text
                      x={w / 2}
                      y={13}
                      textAnchor="middle"
                      className="fill-white text-[11px] font-medium"
                    >
                      {l.text}
                    </text>
                  </g>
                )
              })}
              {isHead && (
                <circle r={R + 4} className="fill-none stroke-emerald-500" strokeWidth={2} />
              )}
              <circle r={R} className={isHead ? 'fill-emerald-500' : 'fill-slate-600'} />
              <text y={R + 16} textAnchor="middle" className="fill-slate-500 font-mono text-[11px]">
                {commit.short}
              </text>
              <text y={R + 31} textAnchor="middle" className="fill-slate-700 text-[11px]">
                {commit.subject.length > 8 ? `${commit.subject.slice(0, 8)}…` : commit.subject}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center px-6 text-sm text-slate-500">
      {text}
    </div>
  )
}
