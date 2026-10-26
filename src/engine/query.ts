// 画面に表示するための読み取り専用の問い合わせ。状態は変えない。
import { subjectOf } from './commands/commit.ts'
import { findWorkspace, resolvePath } from './model/paths.ts'
import type { FilePath, GitDir, Oid, Workspace, World } from './model/types.ts'
import { abbrev, readCommit } from './objects/store.ts'
import { currentBranch, HEADS, headOid, listRemotes, REMOTES } from './refs.ts'
import { aheadBehind } from './remote/transfer.ts'
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
  /** リモート追跡ブランチ（origin/main など。最後に fetch したときのリモートの様子） */
  remoteBranches: { name: string; oid: Oid }[]
  /** ブランチ・リモート追跡ブランチ・HEAD から辿れるコミット。子が必ず親より前に来る（新しい順） */
  commits: CommitNode[]
}

export function repoView(git: GitDir): RepoView {
  const pick = (prefix: string) =>
    Object.entries(git.refs)
      .filter(([ref]) => ref.startsWith(prefix))
      .map(([ref, oid]) => ({ name: ref.slice(prefix.length), oid }))
      .sort((a, b) => (a.name < b.name ? -1 : 1))
  const branches = pick(HEADS)
  const remoteBranches = pick(REMOTES)
  const head = headOid(git)
  const starts = [...branches, ...remoteBranches].map((b) => b.oid)
  if (head) starts.push(head)
  return {
    branch: currentBranch(git),
    head,
    branches,
    remoteBranches,
    commits: topoOrder(git, starts),
  }
}

export interface RemoteBranchState {
  name: string
  /** サーバー上の実際の位置（プレイヤーには見えないはずの「神の視点」） */
  actual: Oid | null
  /** 手元のリモート追跡ブランチ（最後に fetch したときの位置） */
  known: Oid | null
  /** 同じ名前の手元のブランチ */
  local: Oid | null
  /** 手元のブランチが、知っているリモートより何コミット進んで・遅れているか */
  ahead: number
  behind: number
}

export interface RemoteSummary {
  name: string
  url: string
  /** URL の先にリポジトリがない */
  missing: boolean
  branches: RemoteBranchState[]
}

/** 4領域ビューのリモート欄に出す情報 */
export function remoteSummaries(world: World, ws: Workspace): RemoteSummary[] {
  const git = ws.git
  if (!git) return []
  return listRemotes(git).map((name) => {
    const url = git.config[`remote.${name}.url`] ?? ''
    const target = findWorkspace(world, resolvePath(ws.path, url))?.[1].git ?? null
    const actualRefs = target
      ? Object.entries(target.refs).filter(([r]) => r.startsWith(HEADS))
      : []
    const prefix = `${REMOTES}${name}/`
    const names = new Set([
      ...actualRefs.map(([r]) => r.slice(HEADS.length)),
      ...Object.keys(git.refs)
        .filter((r) => r.startsWith(prefix))
        .map((r) => r.slice(prefix.length)),
    ])
    const branches = [...names].sort().map((b) => {
      const known = git.refs[prefix + b] ?? null
      const local = git.refs[HEADS + b] ?? null
      const counts = known && local ? aheadBehind(git, local, known) : { ahead: 0, behind: 0 }
      return {
        name: b,
        actual: target?.refs[HEADS + b] ?? null,
        known,
        local,
        ...counts,
      }
    })
    return { name, url, missing: !target, branches }
  })
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
export function completionNames(ws: Workspace): {
  branches: string[]
  remoteBranches: string[]
  remotes: string[]
  files: FilePath[]
} {
  const files = [...new Set([...Object.keys(ws.files), ...Object.keys(ws.git?.index ?? {})])].sort()
  const names = (prefix: string) =>
    ws.git
      ? Object.keys(ws.git.refs)
          .filter((r) => r.startsWith(prefix))
          .map((r) => r.slice(prefix.length))
          .sort()
      : []
  return {
    branches: names(HEADS),
    remoteBranches: names(REMOTES),
    remotes: ws.git ? listRemotes(ws.git) : [],
    files,
  }
}

/** bare リポジトリ（サーバー役）のパス。clone の補助チップに使う */
export function serverPaths(world: World): string[] {
  return Object.values(world.workspaces)
    .filter((ws) => ws.git?.bare)
    .map((ws) => ws.path)
    .sort()
}
