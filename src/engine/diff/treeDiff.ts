// 2つの tree（平らな表）の差分と、diffstat の整形。

import type { FileMode, FilePath, GitDir } from '../model/types.ts'
import type { FlatTree } from '../objects/store.ts'
import { countChanges } from './lines.ts'

export interface FileChange {
  path: FilePath
  status: 'A' | 'D' | 'M'
  mode: FileMode
  ins: number
  del: number
}

function blobText(git: GitDir, oid: string | undefined): string {
  if (!oid) return ''
  const obj = git.objects[oid]
  return obj?.type === 'blob' ? obj.content : ''
}

export function diffTrees(git: GitDir, before: FlatTree, after: FlatTree): FileChange[] {
  const paths = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
  const changes: FileChange[] = []
  for (const path of paths) {
    const a = before[path]
    const b = after[path]
    if (a && b && a.oid === b.oid && a.mode === b.mode) continue
    const { ins, del } = countChanges(blobText(git, a?.oid), blobText(git, b?.oid))
    const status = !a ? 'A' : !b ? 'D' : 'M'
    changes.push({ path, status, mode: (b ?? a)?.mode ?? '100644', ins, del })
  }
  return changes
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** " 2 files changed, 3 insertions(+), 1 deletion(-)" */
export function summaryLine(changes: FileChange[]): string {
  if (changes.length === 0) return ' 0 files changed'
  const ins = changes.reduce((n, c) => n + c.ins, 0)
  const del = changes.reduce((n, c) => n + c.del, 0)
  let line = ` ${plural(changes.length, 'file')} changed`
  if (ins > 0 || del === 0) line += `, ${plural(ins, 'insertion')}(+)`
  if (del > 0 || ins === 0) line += `, ${plural(del, 'deletion')}(-)`
  return line
}

/** commit の要約の後ろに出る " create mode 100644 a.txt" の行 */
export function modeLines(changes: FileChange[]): string[] {
  return changes
    .filter((c) => c.status !== 'M')
    .map((c) => ` ${c.status === 'A' ? 'create' : 'delete'} mode ${c.mode} ${c.path}`)
}

/** merge の fast-forward などで出る diffstat（ファイルごとの行＋要約） */
export function diffstat(changes: FileChange[], width = 80): string[] {
  if (changes.length === 0) return []
  const nameWidth = Math.max(...changes.map((c) => c.path.length))
  const maxChange = Math.max(...changes.map((c) => c.ins + c.del))
  const countWidth = String(maxChange).length
  // gitと同じく、名前＋数字＋区切りの残りの幅にグラフを収める
  const graphWidth = Math.max(width - nameWidth - countWidth - 6, 6)
  const scale = (n: number) =>
    maxChange <= graphWidth || n === 0 ? n : 1 + Math.floor((n * (graphWidth - 1)) / maxChange)
  const lines = changes.map((c) => {
    const total = c.ins + c.del
    let plus = scale(c.ins)
    let minus = scale(c.del)
    if (maxChange > graphWidth && plus + minus > scale(total)) {
      if (plus > minus) plus = scale(total) - minus
      else minus = scale(total) - plus
    }
    const graph = '+'.repeat(plus) + '-'.repeat(minus)
    return ` ${c.path.padEnd(nameWidth)} | ${String(total).padStart(countWidth)}${graph ? ` ${graph}` : ''}`
  })
  return [...lines, summaryLine(changes)]
}
