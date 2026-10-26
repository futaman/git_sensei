// HEAD・index・作業ツリーの3者を比べて、変更の一覧を作る（status / commit / switch が使う）。

import type { FilePath, GitDir, Workspace } from '../model/types.ts'
import { hashBlob } from '../objects/serialize.ts'
import { commitTree, type FlatTree } from '../objects/store.ts'
import { headOid } from '../refs.ts'

export type StagedKind = 'A' | 'M' | 'D'
export type UnstagedKind = 'M' | 'D'

export interface WorktreeStatus {
  head: FlatTree
  staged: Map<FilePath, StagedKind>
  unstaged: Map<FilePath, UnstagedKind>
  /** index にないファイル（そのままのパス） */
  untracked: FilePath[]
  /** コンフリクト中のファイルと、その種類（UU / AA / UD など、status -s の2文字） */
  unmerged: Map<FilePath, UnmergedCode>
}

export type UnmergedCode = 'UU' | 'AA' | 'UD' | 'DU' | 'AU' | 'UA' | 'DD'

export function unmergedCode(git: GitDir, path: FilePath): UnmergedCode {
  const e = git.unmerged[path] ?? {}
  const [b, o, t] = [!!e.base, !!e.ours, !!e.theirs]
  if (o && t) return b ? 'UU' : 'AA'
  if (o) return b ? 'UD' : 'AU'
  if (t) return b ? 'DU' : 'UA'
  return 'DD'
}

export function computeStatus(git: GitDir, ws: Workspace): WorktreeStatus {
  const head = commitTree(git, headOid(git))
  const staged = new Map<FilePath, StagedKind>()
  const unstaged = new Map<FilePath, UnstagedKind>()
  const unmerged = new Map(Object.keys(git.unmerged).map((p) => [p, unmergedCode(git, p)]))

  for (const path of new Set([...Object.keys(head), ...Object.keys(git.index)])) {
    if (unmerged.has(path)) continue
    const h = head[path]
    const i = git.index[path]
    if (!h && i) staged.set(path, 'A')
    else if (h && !i) staged.set(path, 'D')
    else if (h && i && (h.oid !== i.oid || h.mode !== i.mode)) staged.set(path, 'M')
  }
  for (const [path, entry] of Object.entries(git.index)) {
    const content = ws.files[path]
    if (content === undefined) unstaged.set(path, 'D')
    else if (hashBlob(content) !== entry.oid) unstaged.set(path, 'M')
  }
  const untracked = Object.keys(ws.files)
    .filter((p) => !(p in git.index) && !unmerged.has(p))
    .sort()
  return { head, staged, unstaged, untracked, unmerged }
}

export function isClean(st: WorktreeStatus): boolean {
  return (
    st.staged.size === 0 &&
    st.unstaged.size === 0 &&
    st.untracked.length === 0 &&
    st.unmerged.size === 0
  )
}

/**
 * 追跡中のファイルを1つも含まないディレクトリは "dir/" にまとめる（git status の既定の表示）
 */
export function collapseUntracked(git: GitDir, untracked: FilePath[]): string[] {
  const tracked = [...Object.keys(git.index), ...Object.keys(git.unmerged)]
  const hasTracked = (dir: string) => tracked.some((p) => p.startsWith(dir))
  const out = new Set<string>()
  for (const path of untracked) {
    const parts = path.split('/')
    let shown = path
    for (let depth = 1; depth < parts.length; depth++) {
      const dir = `${parts.slice(0, depth).join('/')}/`
      if (!hasTracked(dir)) {
        shown = dir
        break
      }
    }
    out.add(shown)
  }
  return [...out].sort()
}
