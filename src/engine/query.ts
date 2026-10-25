// 画面に表示するための読み取り専用の問い合わせ。状態は変えない。
import { subjectOf } from './commands/commit.ts'
import type { FilePath, GitDir, Oid, Workspace } from './model/types.ts'
import { abbrev, readCommit } from './objects/store.ts'
import { currentBranch, HEADS, headOid } from './refs.ts'
import { computeStatus } from './worktree/status.ts'

export interface FileState {
  path: FilePath
  /** 作業ツリーでの状態（index と比べて） */
  worktree: 'clean' | 'modified' | 'deleted' | 'untracked'
  /** ステージ済みの変更（HEAD と比べて） */
  staged: 'A' | 'M' | 'D' | null
}

/** 作業ツリー・index・HEAD に出てくるすべてのファイルの状態。パス順 */
export function fileStates(ws: Workspace): FileState[] {
  const git = ws.git
  if (!git) {
    return Object.keys(ws.files)
      .sort()
      .map((path) => ({ path, worktree: 'untracked', staged: null }))
  }
  const st = computeStatus(git, ws)
  const paths = new Set([
    ...Object.keys(ws.files),
    ...Object.keys(git.index),
    ...Object.keys(st.head),
  ])
  return [...paths].sort().map((path) => {
    const unstaged = st.unstaged.get(path)
    const worktree =
      unstaged === 'M'
        ? 'modified'
        : unstaged === 'D'
          ? 'deleted'
          : !(path in git.index) && path in ws.files
            ? 'untracked'
            : 'clean'
    return { path, worktree, staged: st.staged.get(path) ?? null }
  })
}

export interface CommitNode {
  oid: Oid
  short: string
  parents: Oid[]
  subject: string
  author: string
  timestamp: number
}

export interface RepoView {
  /** HEAD が指すブランチ（detached なら null） */
  branch: string | null
  head: Oid | null
  branches: { name: string; oid: Oid }[]
  /** ブランチと HEAD から辿れるコミット。子が必ず親より前に来る（新しい順） */
  commits: CommitNode[]
}

export function repoView(git: GitDir): RepoView {
  const branches = Object.entries(git.refs)
    .filter(([ref]) => ref.startsWith(HEADS))
    .map(([ref, oid]) => ({ name: ref.slice(HEADS.length), oid }))
    .sort((a, b) => (a.name < b.name ? -1 : 1))
  const head = headOid(git)
  const starts = [...branches.map((b) => b.oid), ...(head ? [head] : [])]
  return { branch: currentBranch(git), head, branches, commits: topoOrder(git, starts) }
}

/** 子が親より先に来る順序。その中ではコミット日時の新しい順 */
function topoOrder(git: GitDir, starts: Oid[]): CommitNode[] {
  const nodes = new Map<Oid, CommitNode>()
  const stack = [...starts]
  while (stack.length > 0) {
    const oid = stack.pop() as Oid
    if (nodes.has(oid)) continue
    const c = readCommit(git, oid)
    nodes.set(oid, {
      oid,
      short: abbrev(git, oid),
      parents: [...c.parents],
      subject: subjectOf(c.message),
      author: c.author.name,
      timestamp: c.committer.timestamp,
    })
    stack.push(...c.parents)
  }
  const childCount = new Map<Oid, number>()
  for (const n of nodes.values()) {
    for (const p of n.parents) childCount.set(p, (childCount.get(p) ?? 0) + 1)
  }
  const order = [...nodes.values()]
  const ready = order.filter((n) => !childCount.get(n.oid))
  const out: CommitNode[] = []
  while (ready.length > 0) {
    ready.sort((a, b) => b.timestamp - a.timestamp)
    const next = ready.shift() as CommitNode
    out.push(next)
    for (const p of next.parents) {
      const left = (childCount.get(p) ?? 0) - 1
      childCount.set(p, left)
      if (left === 0) ready.push(nodes.get(p) as CommitNode)
    }
  }
  return out
}

/** Tab 補完の候補に使う名前 */
export function completionNames(ws: Workspace): { branches: string[]; files: FilePath[] } {
  const files = [...new Set([...Object.keys(ws.files), ...Object.keys(ws.git?.index ?? {})])].sort()
  const branches = ws.git
    ? Object.keys(ws.git.refs)
        .filter((r) => r.startsWith(HEADS))
        .map((r) => r.slice(HEADS.length))
        .sort()
    : []
  return { branches, files }
}
