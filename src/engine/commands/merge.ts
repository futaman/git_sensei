import { diffstat, diffTrees, modeLines } from '../diff/treeDiff.ts'
import { mergeBases, mergeTrees } from '../merge/treeMerge.ts'
import { has, own } from '../model/dict.ts'
import type { GitDir, Oid } from '../model/types.ts'
import {
  abbrev,
  commitTree,
  flattenTree,
  isAncestor,
  readBlob,
  writeObject,
  writeTree,
} from '../objects/store.ts'
import { parseArgs } from '../parser/options.ts'
import { branchRef, currentBranch, headOid, REMOTES, resolveRevision } from '../refs.ts'
import { switchErrorLines, switchTrees } from '../worktree/checkout.ts'
import { computeStatus } from '../worktree/status.ts'
import { commit, signatureNow } from './commit.ts'
import { abort, type Cmd, exitKeep, fail, requireWorktree, unsupported } from './context.ts'

export function merge(cmd: Cmd, argv: string[]): void {
  const parsed = parseArgs(argv, [
    { name: 'ff-only', long: ['ff-only'] },
    { name: 'no-ff', long: ['no-ff'] },
    { name: 'ff', long: ['ff'] },
    { name: 'abort', long: ['abort'] },
    { name: 'continue', long: ['continue'] },
    { name: 'no-edit', long: ['no-edit'] },
    { name: 'message', short: 'm', value: true, multiple: true },
  ])
  if (!parsed.ok) fail(cmd, parsed.error, 129)
  const { flags, values, positionals } = parsed.args
  const git = requireWorktree(cmd)
  if (flags.has('abort')) {
    abortMerge(cmd, git)
    return
  }
  if (flags.has('continue')) {
    if (!git.merge) fail(cmd, 'fatal: There is no merge in progress (MERGE_HEAD missing).')
    // --continue はエディタを開く commit と同じ（コメント行の説明は消える）
    commit(cmd, [])
    return
  }
  refuseWhileMerging(cmd, git)
  if (positionals.length === 0) fail(cmd, 'fatal: No remote for the current branch.')
  if (positionals.length > 1) unsupported(cmd, '複数のブランチを一度にマージすること')

  const spec = positionals[0] as string
  const target = resolveRevision(git, spec)
  if (!target) fail(cmd, `merge: ${spec} - not something we can merge`, 1)

  const head = headOid(git)
  if (head === null) unsupported(cmd, 'まだコミットがないブランチへのマージ')
  if (head === target || isAncestor(git, target, head)) {
    cmd.out.push('Already up to date.')
    return
  }
  const canFastForward = isAncestor(git, head, target)
  if (canFastForward && !flags.has('no-ff')) {
    if (!fastForward(cmd, git, head, target)) abort(1)
    return
  }
  if (!canFastForward && flags.has('ff-only')) {
    fail(cmd, 'fatal: Not possible to fast-forward, aborting.')
  }

  const custom = values.get('message')
  const message = custom ? `${custom.join('\n\n')}\n` : mergeMessage(git, spec)
  const result = threeWayMerge(cmd, git, { head, target, label: spec, message })
  if (result === 'blocked') abort(2)
  if (result === 'conflict') exitKeep(1)
}

/** マージの途中で、新しいマージや pull を始めようとしたとき */
export function refuseWhileMerging(cmd: Cmd, git: GitDir): void {
  if (Object.keys(git.unmerged).length > 0) {
    fail(
      cmd,
      [
        'error: Merging is not possible because you have unmerged files.',
        "hint: Fix them up in the work tree, and then use 'git add/rm <file>'",
        'hint: as appropriate to mark resolution and make a commit.',
        'fatal: Exiting because of an unresolved conflict.',
      ].join('\n'),
    )
  }
  if (git.merge) {
    fail(
      cmd,
      [
        'fatal: You have not concluded your merge (MERGE_HEAD exists).',
        'Please, commit your changes before you merge.',
      ].join('\n'),
    )
  }
}

/** "Merge branch 'feature'" など。main / master へのマージでは " into main" を付けない */
export function mergeMessage(
  git: GitDir,
  spec: string,
  from?: { url: string; branch: string },
): string {
  const current = currentBranch(git)
  const into = current && current !== 'main' && current !== 'master' ? ` into ${current}` : ''
  if (from) return `Merge branch '${from.branch}' of ${from.url}${into}\n`
  if (has(git.refs, branchRef(spec))) return `Merge branch '${spec}'${into}\n`
  if (has(git.refs, `${REMOTES}${spec}`)) return `Merge remote-tracking branch '${spec}'${into}\n`
  return `Merge commit '${spec}'${into}\n`
}

const OVERWRITE_LOCAL = (files: string[]) => [
  'error: Your local changes to the following files would be overwritten by merge:',
  ...files.map((f) => `\t${f}`),
  'Please commit your changes or stash them before you merge.',
  'Aborting',
]

/**
 * 3-wayマージ。きれいにマージできればマージコミットを作り、コンフリクトなら途中の状態で止める。
 * 手元の変更があってマージを始められないときは 'blocked'（何も変えない）
 */
export function threeWayMerge(
  cmd: Cmd,
  git: GitDir,
  opts: { head: Oid; target: Oid; label: string; message: string },
): 'merged' | 'conflict' | 'blocked' {
  const { head, target, label, message } = opts
  const bases = mergeBases(git, head, target)
  if (bases.length === 0) fail(cmd, 'fatal: refusing to merge unrelated histories')
  if (bases.length > 1) unsupported(cmd, '交差したマージ（共通の祖先が複数ある履歴）')

  const ours = commitTree(git, head)
  const theirs = commitTree(git, target)
  const result = mergeTrees(git, commitTree(git, bases[0] as Oid), ours, theirs, {
    ours: 'HEAD',
    theirs: label,
  })

  // ステージ済みの変更があると、ort は始めない
  const st = computeStatus(git, cmd.ws)
  if (st.staged.size > 0) {
    cmd.err.push(
      ...OVERWRITE_LOCAL([...st.staged.keys()].sort()),
      'Merge with strategy ort failed.',
    )
    return 'blocked'
  }
  // マージで書き換わるファイルに、未ステージの変更や未追跡のファイルがあれば止める
  const touched = new Set([
    ...Object.keys({ ...ours, ...result.clean }).filter(
      (p) => own(ours, p)?.oid !== own(result.clean, p)?.oid,
    ),
    ...result.conflicts.map((c) => c.path),
  ])
  const dirty = [...touched].filter((p) => st.unstaged.has(p)).sort()
  const untracked = [...touched].filter((p) => !has(ours, p) && has(cmd.ws.files, p)).sort()
  if (dirty.length > 0 || untracked.length > 0) {
    if (dirty.length > 0) cmd.err.push(...OVERWRITE_LOCAL(dirty))
    if (untracked.length > 0) {
      cmd.err.push(
        'error: The following untracked working tree files would be overwritten by merge:',
        ...untracked.map((f) => `\t${f}`),
        'Please move or remove them before you merge.',
        'Aborting',
      )
    }
    cmd.err.push('Merge with strategy ort failed.')
    return 'blocked'
  }

  // index と作業ツリーに書く
  for (const path of touched) {
    const entry = own(result.clean, path)
    if (entry) {
      git.index[path] = { ...entry }
      cmd.ws.files[path] = readBlob(git, entry.oid).content
    } else {
      delete git.index[path]
      delete cmd.ws.files[path]
    }
  }
  for (const c of result.conflicts) {
    delete git.index[c.path]
    git.unmerged[c.path] = c.stages
    if (c.worktree !== null) cmd.ws.files[c.path] = c.worktree
  }
  cmd.out.push(...result.messages)

  const branch = currentBranch(git)
  if (result.conflicts.length > 0) {
    git.origHead = head
    git.merge = {
      head: target,
      message: `${message}\n# Conflicts:\n${result.conflicts.map((c) => `#\t${c.path}\n`).join('')}`,
    }
    cmd.out.push('Automatic merge failed; fix conflicts and then commit the result.')
    cmd.events.push({
      type: 'MERGE_CONFLICT',
      branch,
      from: label,
      files: result.conflicts.map((c) => ({ path: c.path, kind: c.kind })),
    })
    return 'conflict'
  }

  const tree = writeTree(git, git.index)
  const now = signatureNow(cmd)
  git.origHead = head
  const oid = writeObject(git, {
    type: 'commit',
    tree,
    parents: [head, target],
    author: now,
    committer: now,
    message,
  })
  if (git.head.type === 'symbolic') git.refs[git.head.ref] = oid
  else git.head = { type: 'detached', oid }
  const changes = diffTrees(git, ours, flattenTree(git, tree))
  cmd.out.push("Merge made by the 'ort' strategy.", ...diffstat(changes), ...modeLines(changes))
  cmd.events.push({ type: 'COMMIT_CREATED', oid, parents: [head, target], branch, amend: false })
  cmd.events.push({ type: 'MERGED', branch, from: label, oid })
  return 'merged'
}

/** git merge --abort：マージで変わった index と作業ツリーを HEAD に戻す（git reset --merge 相当） */
function abortMerge(cmd: Cmd, git: GitDir): void {
  if (!git.merge) fail(cmd, 'fatal: There is no merge to abort (MERGE_HEAD missing).')
  const head = commitTree(git, headOid(git))
  const paths = new Set([
    ...Object.keys(git.unmerged),
    ...Object.keys(git.index),
    ...Object.keys(head),
  ])
  for (const path of paths) {
    const h = own(head, path)
    const i = own(git.index, path)
    const conflicted = has(git.unmerged, path)
    if (!conflicted && h?.oid === i?.oid && h?.mode === i?.mode) continue
    delete git.unmerged[path]
    if (h) {
      git.index[path] = { ...h }
      cmd.ws.files[path] = readBlob(git, h.oid).content
    } else {
      delete git.index[path]
      delete cmd.ws.files[path]
    }
  }
  git.merge = null
  cmd.events.push({ type: 'MERGE_ABORTED' })
}

/**
 * HEAD を target まで早送りする（merge と pull が使う）。
 * 手元の変更が上書きされるなら何も変えずに false を返す（エラー文は出力済み）
 */
export function fastForward(cmd: Cmd, git: GitDir, head: Oid, target: Oid): boolean {
  cmd.out.push(`Updating ${abbrev(git, head)}..${abbrev(git, target)}`)
  const from = commitTree(git, head)
  const to = commitTree(git, target)
  const result = switchTrees(git, cmd.ws, from, to)
  if (!result.ok) {
    cmd.err.push(...switchErrorLines(result, 'merge'))
    return false
  }
  git.origHead = head
  if (git.head.type === 'symbolic') git.refs[git.head.ref] = target
  else git.head = { type: 'detached', oid: target }

  const changes = diffTrees(git, from, to)
  cmd.out.push('Fast-forward', ...diffstat(changes), ...modeLines(changes))
  cmd.events.push({ type: 'FAST_FORWARDED', branch: currentBranch(git), from: head, to: target })
  return true
}

/** 作業ツリーのファイルがまだコンフリクトの印を含んでいるか（画面のヒントに使う） */
export function hasConflictMarkers(content: string): boolean {
  return /^(<{7}|={7}|>{7})( |$)/m.test(content)
}
