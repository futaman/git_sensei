// 画面に表示するための読み取り専用の問い合わせ。状態は変えない。
import { subjectOf } from './commands/commit.ts'
import { has, own } from './model/dict.ts'
import { findWorkspace, resolvePath } from './model/paths.ts'
import type { FilePath, GitDir, Oid, Workspace, World } from './model/types.ts'
import { abbrev, commitTree, readBlob, readCommit } from './objects/store.ts'
import { currentBranch, HEADS, headOid, listRemotes, REMOTES } from './refs.ts'
import { aheadBehind, commitsOnlyIn } from './remote/transfer.ts'
import { computeStatus } from './worktree/status.ts'

export interface FileState {
  path: FilePath
  /** 作業ツリーでの状態（index と比べて）。conflicted はマージのコンフリクト中 */
  worktree: 'clean' | 'modified' | 'deleted' | 'untracked' | 'conflicted'
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
    ...Object.keys(git.unmerged),
    ...Object.keys(st.head),
  ])
  return [...paths].sort().map((path): FileState => {
    if (st.unmerged.has(path)) return { path, worktree: 'conflicted', staged: null }
    const unstaged = st.unstaged.get(path)
    const worktree =
      unstaged === 'M'
        ? 'modified'
        : unstaged === 'D'
          ? 'deleted'
          : !has(git.index, path) && has(ws.files, path)
            ? 'untracked'
            : 'clean'
    return { path, worktree, staged: st.staged.get(path) ?? null }
  })
}

/**
 * 作業ツリーに path というファイルを作るとき、ファイルとディレクトリの名前がぶつかるか。
 * 途中のディレクトリと同じ名前のファイルがある（'d' があるのに 'd/x'）か、
 * 同じ名前のディレクトリがある（'d/x' があるのに 'd'）ならぶつかる。
 * clone でできたフォルダ（別のワークスペース）も、同じ名前のディレクトリとして扱う
 */
export type PathConflict =
  | { kind: 'parentIsFile'; path: FilePath }
  | { kind: 'isDirectory' }
  | { kind: 'insideWorkspace'; name: string }
  | null

export function pathConflict(world: World, ws: Workspace, path: FilePath): PathConflict {
  const parts = path.split('/')
  for (let depth = 1; depth < parts.length; depth++) {
    const parent = parts.slice(0, depth).join('/')
    if (has(ws.files, parent)) return { kind: 'parentIsFile', path: parent }
  }
  const dir = `${path}/`
  if (Object.keys(ws.files).some((p) => p.startsWith(dir))) return { kind: 'isDirectory' }
  const first = parts[0] as string
  if (findWorkspace(world, resolvePath(ws.path, first))) {
    return parts.length === 1 ? { kind: 'isDirectory' } : { kind: 'insideWorkspace', name: first }
  }
  return null
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
  /** マージの途中なら、取り込もうとしているコミット */
  mergingWith: Oid | null
  /** コンフリクトが残っているファイル */
  conflicts: FilePath[]
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
  // マージの途中は、取り込もうとしているコミットもグラフに出す
  if (git.merge) starts.push(git.merge.head)
  return {
    branch: currentBranch(git),
    head,
    branches,
    remoteBranches,
    commits: topoOrder(git, starts),
    mergingWith: git.merge?.head ?? null,
    conflicts: Object.keys(git.unmerged).sort(),
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
    const url = own(git.config, `remote.${name}.url`) ?? ''
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
      const known = own(git.refs, prefix + b) ?? null
      const local = own(git.refs, HEADS + b) ?? null
      const counts = known && local ? aheadBehind(git, local, known) : { ahead: 0, behind: 0 }
      return {
        name: b,
        actual: (target && own(target.refs, HEADS + b)) ?? null,
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

/** コミットのメッセージ */
export function commitMessage(git: GitDir, oid: Oid): string {
  return readCommit(git, oid).message
}

/** コミット時点のすべてのファイルのパス */
export function commitFiles(git: GitDir, oid: Oid): FilePath[] {
  return Object.keys(commitTree(git, oid)).sort()
}

/** to から辿れて from から辿れないコミット（push で新しく送ったコミットなど） */
export function commitsBetween(git: GitDir, from: Oid | null, to: Oid): Oid[] {
  return commitsOnlyIn(git, to, from)
}

/** ワークスペースに登録されたリモート（origin など）の先にあるリポジトリ。なければ null */
export function remoteRepository(world: World, workspace: string, remote: string): GitDir | null {
  const ws = own(world.workspaces, workspace)
  const url = ws?.git ? own(ws.git.config, `remote.${remote}.url`) : undefined
  if (!ws || !url) return null
  return findWorkspace(world, resolvePath(ws.path, url))?.[1].git ?? null
}

/** コミット時点のファイルの内容（パス → 中身） */
export function commitFileContents(git: GitDir, oid: Oid): Record<FilePath, string> {
  const tree = commitTree(git, oid)
  return Object.fromEntries(
    Object.entries(tree).map(([path, e]) => [path, readBlob(git, e.oid).content]),
  )
}

/** コンフリクトの印（<<<<<<< と >>>>>>>）が残っているか */
export function hasConflictMarkers(content: string): boolean {
  return /^<{7}( |$)/m.test(content) && /^>{7}( |$)/m.test(content)
}
