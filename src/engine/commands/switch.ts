// git switch / git checkout（ブランチの切り替え部分）。

import type { HeadPosition } from '../events.ts'
import { has, own } from '../model/dict.ts'
import type { GitDir, Oid } from '../model/types.ts'
import { abbrev, ancestors, commitTree, readCommit } from '../objects/store.ts'
import { parseArgs } from '../parser/options.ts'
import {
  branchRef,
  currentBranch,
  headOid,
  headPosition,
  listRemotes,
  REMOTES,
  resolveRevision,
} from '../refs.ts'
import { localChangeLines, switchErrorLines, switchTrees } from '../worktree/checkout.ts'
import { createBranch } from './branch.ts'
import { subjectOf } from './commit.ts'
import { abort, type Cmd, fail, requireWorktree, unsupported } from './context.ts'
import { checkoutPaths } from './restore.ts'
import { trackingLines } from './status.ts'

type Destination = { branch: string; created?: boolean } | { detach: Oid; spec: string }

export function switchCmd(cmd: Cmd, argv: string[]): void {
  const parsed = parseArgs(argv, [
    { name: 'create', short: 'c', long: ['create'], value: true },
    { name: 'force-create', short: 'C', long: ['force-create'], value: true },
    { name: 'detach', short: 'd', long: ['detach'] },
  ])
  if (!parsed.ok) fail(cmd, parsed.error, 129)
  const { flags, values, positionals } = parsed.args
  const git = requireWorktree(cmd)
  refuseDuringConflict(cmd, git, true)

  const create = values.get('create')?.[0] ?? values.get('force-create')?.[0]
  if (create !== undefined) {
    if (positionals.length > 1) fail(cmd, 'fatal: too many arguments')
    startNewBranch(cmd, git, create, positionals[0], values.has('force-create'))
    return
  }
  if (flags.has('detach')) {
    const spec = positionals[0] ?? 'HEAD'
    const oid = resolveRevision(git, spec)
    if (!oid) fail(cmd, `fatal: invalid reference: ${spec}`)
    moveHead(cmd, git, { detach: oid, spec })
    return
  }
  if (positionals.length === 0) fail(cmd, 'fatal: missing branch or commit argument')
  if (positionals.length > 1) fail(cmd, 'fatal: only one reference expected')
  const name = resolvePrevious(cmd, git, positionals[0] as string)
  if (has(git.refs, branchRef(name))) {
    moveHead(cmd, git, { branch: name })
    return
  }
  const guess = guessRemoteBranch(git, name)
  if (guess) {
    startNewBranch(cmd, git, name, guess, false)
    return
  }
  if (resolveRevision(git, name)) {
    fail(
      cmd,
      [
        `fatal: a branch is expected, got commit '${name}'`,
        'hint: If you want to detach HEAD at the commit, try again with the --detach option.',
      ].join('\n'),
    )
  }
  fail(cmd, `fatal: invalid reference: ${name}`)
}

export function checkoutCmd(cmd: Cmd, argv: string[]): void {
  const specs = [
    { name: 'branch', short: 'b', value: true },
    { name: 'force-branch', short: 'B', value: true },
    { name: 'detach', long: ['detach'] },
    { name: 'ours', long: ['ours'] },
    { name: 'theirs', long: ['theirs'] },
    { name: 'merge', short: 'm', long: ['merge'] },
  ]
  const parsed = parseArgs(argv, specs)
  if (!parsed.ok) fail(cmd, parsed.error, 129)
  const { flags, values, positionals } = parsed.args
  const git = requireWorktree(cmd)

  // -- より前の引数（コミットの指定）と、後ろの引数（ファイル）を分ける
  const dashdash = argv.indexOf('--')
  const before =
    dashdash === -1
      ? positionals
      : (parseArgs(argv.slice(0, dashdash), specs) as typeof parsed).args.positionals
  const side = flags.has('ours') ? 'ours' : flags.has('theirs') ? 'theirs' : null
  if (flags.has('merge') && (dashdash !== -1 || side)) {
    unsupported(cmd, 'git checkout -m <file>（コンフリクトの印を作り直す）')
  }
  if (dashdash !== -1 || side) {
    const files = dashdash === -1 ? positionals : argv.slice(dashdash + 1)
    if (before.length > 1 || (dashdash === -1 && side === null)) {
      fail(cmd, 'fatal: only one reference expected')
    }
    const treeish = dashdash === -1 ? null : (before[0] ?? null)
    if (files.length === 0) {
      if (treeish !== null && dashdash !== -1) {
        // git checkout <commit> -- はファイル指定なし：ブランチの切り替えとして扱う
      } else fail(cmd, 'fatal: you must specify path(s) to restore')
    } else {
      if (treeish !== null && !resolveRevision(git, treeish)) {
        fail(cmd, `fatal: invalid reference: ${treeish}`)
      }
      checkoutPaths(cmd, git, treeish, files, side, dashdash === -1)
      return
    }
  }

  const create = values.get('branch')?.[0] ?? values.get('force-branch')?.[0]
  if (create !== undefined) {
    refuseDuringConflict(cmd, git, false)
    if (positionals.length > 1) unsupported(cmd, 'git checkout -b のファイル指定')
    startNewBranch(cmd, git, create, positionals[0], values.has('force-branch'))
    return
  }
  if (positionals.length === 0) fail(cmd, 'git-sensei: 切り替え先のブランチを指定してください', 1)
  if (positionals.length > 1) {
    // git checkout <commit> <file>...：最初の引数がコミットなら、残りはファイル
    const [first, ...rest] = positionals as [string, ...string[]]
    if (resolveRevision(git, first)) checkoutPaths(cmd, git, first, rest, null, true)
    else checkoutPaths(cmd, git, null, positionals, null, true)
    return
  }

  const spec = resolvePrevious(cmd, git, positionals[0] as string)
  if (!flags.has('detach') && has(git.refs, branchRef(spec))) {
    refuseDuringConflict(cmd, git, false)
    moveHead(cmd, git, { branch: spec })
    return
  }
  const guess = flags.has('detach') ? null : guessRemoteBranch(git, spec)
  if (guess && !resolveRevision(git, spec)) {
    refuseDuringConflict(cmd, git, false)
    startNewBranch(cmd, git, spec, guess, false)
    return
  }
  const oid = resolveRevision(git, spec)
  if (oid) {
    refuseDuringConflict(cmd, git, false)
    moveHead(cmd, git, { detach: oid, spec })
    return
  }
  // ブランチでもコミットでもなければ、ファイルを index の内容に戻す（git checkout <file>）
  checkoutPaths(cmd, git, null, [spec], null, true)
}

/** コンフリクトの途中は切り替えられない（switch はマージの途中そのものも断る） */
function refuseDuringConflict(cmd: Cmd, git: GitDir, isSwitch: boolean): void {
  // switch は、コンフリクトが残っているかより先に「マージの途中か」を見る
  if (isSwitch && git.merge) {
    fail(
      cmd,
      [
        'fatal: cannot switch branch while merging',
        'Consider "git merge --quit" or "git worktree add".',
      ].join('\n'),
    )
  }
  const paths = Object.keys(git.unmerged).sort()
  if (paths.length > 0) {
    cmd.err.push(
      'error: you need to resolve your current index first',
      ...paths.map((p) => `${p}: needs merge`),
    )
    abort(1)
  }
}

/**
 * 手元にないブランチ名でも、ちょうど1つのリモートにあれば 'origin/<name>' を返す
 * （git switch feature で origin/feature を追跡するブランチが作られる）
 */
function guessRemoteBranch(git: GitDir, name: string): string | null {
  const hits = listRemotes(git).filter((r) => has(git.refs, `${REMOTES}${r}/${name}`))
  return hits.length === 1 ? `${hits[0]}/${name}` : null
}

function resolvePrevious(cmd: Cmd, git: GitDir, name: string): string {
  if (name !== '-' && name !== '@{-1}') return name
  if (git.previousBranch === null) fail(cmd, 'fatal: invalid reference: @{-1}')
  return git.previousBranch
}

function startNewBranch(
  cmd: Cmd,
  git: GitDir,
  name: string,
  start: string | undefined,
  force: boolean,
): void {
  if (start === undefined && headOid(git) === null) {
    // まだコミットがないリポジトリ：HEAD が指すブランチ名を変えるだけ
    if (has(git.refs, branchRef(name)) && !force)
      fail(cmd, `fatal: a branch named '${name}' already exists`)
    const from = headPosition(git)
    git.head = { type: 'symbolic', ref: branchRef(name) }
    cmd.err.push(`Switched to a new branch '${name}'`)
    cmd.events.push({ type: 'HEAD_MOVED', from, to: headPosition(git) })
    return
  }
  // まだコミットのないブランチ main にいて main を作る場合、作った瞬間に HEAD も動いてしまうので、
  // 作る前の位置を覚えておく
  const before = { oid: headOid(git), position: headPosition(git) }
  createBranch(cmd, git, name, start, force)
  moveHead(cmd, git, { branch: name, created: true }, before)
}

export function moveHead(
  cmd: Cmd,
  git: GitDir,
  dest: Destination,
  before?: { oid: Oid | null; position: HeadPosition },
): void {
  const fromBranch = currentBranch(git)
  const fromOid = before ? before.oid : headOid(git)
  const from = before ? before.position : headPosition(git)

  if ('branch' in dest && dest.branch === fromBranch && !dest.created) {
    cmd.err.push(`Already on '${dest.branch}'`)
    cmd.out.push(...trackingLines(git))
    return
  }
  const toOid = 'branch' in dest ? (own(git.refs, branchRef(dest.branch)) ?? null) : dest.detach
  const result = switchTrees(git, cmd.ws, commitTree(git, fromOid), commitTree(git, toOid))
  if (!result.ok) {
    cmd.err.push(...switchErrorLines(result, 'checkout'))
    abort(1)
  }

  // detached HEAD から離れるとき、どのブランチからも辿れないコミットを警告する
  if (fromBranch === null && fromOid !== null && fromOid !== toOid) {
    const reachable = new Set<Oid>()
    for (const oid of Object.values(git.refs)) for (const a of ancestors(git, oid)) reachable.add(a)
    if (toOid) for (const a of ancestors(git, toOid)) reachable.add(a)
    const lost = [...ancestors(git, fromOid)].filter((o) => !reachable.has(o))
    if (lost.length > 0) {
      const n = lost.length
      cmd.err.push(
        `Warning: you are leaving ${n} commit${n === 1 ? '' : 's'} behind, not connected to`,
        'any of your branches:',
        '',
        ...lost
          .slice(0, 5)
          .map((o) => `  ${abbrev(git, o)} ${subjectOf(readCommit(git, o).message)}`),
        ...(n > 5 ? [` ... and ${n - 5} more.`] : []),
        '',
        'If you want to keep it by creating a new branch, this may be a good time',
        'to do so with:',
        '',
        ` git branch <new-branch-name> ${abbrev(git, fromOid)}`,
        '',
      )
      cmd.events.push({ type: 'COMMITS_ORPHANED', oids: lost })
    } else {
      cmd.err.push(`Previous HEAD position was ${describe(git, fromOid)}`)
    }
  }

  if ('branch' in dest) {
    git.head = { type: 'symbolic', ref: branchRef(dest.branch) }
    git.detachedAt = null
  } else {
    git.head = { type: 'detached', oid: dest.detach }
    git.detachedAt = dest.detach
  }
  if (fromBranch !== null) git.previousBranch = fromBranch

  cmd.out.push(...localChangeLines(git, cmd.ws, commitTree(git, toOid)))
  if ('branch' in dest) {
    cmd.err.push(
      dest.created
        ? `Switched to a new branch '${dest.branch}'`
        : `Switched to branch '${dest.branch}'`,
    )
    // 既存のブランチに上流があれば、どれだけ進んでいる・遅れているかを伝える
    if (!dest.created) cmd.out.push(...trackingLines(git))
  } else {
    if (fromBranch !== null) cmd.err.push(...detachedAdvice(dest.spec))
    cmd.err.push(`HEAD is now at ${describe(git, dest.detach)}`)
    cmd.events.push({ type: 'DETACHED_HEAD_ENTERED', oid: dest.detach })
  }
  cmd.events.push({ type: 'HEAD_MOVED', from, to: headPosition(git) })
}

function describe(git: GitDir, oid: Oid): string {
  return `${abbrev(git, oid)} ${subjectOf(readCommit(git, oid).message)}`
}

function detachedAdvice(spec: string): string[] {
  return [
    `Note: switching to '${spec}'.`,
    '',
    "You are in 'detached HEAD' state. You can look around, make experimental",
    'changes and commit them, and you can discard any commits you make in this',
    'state without impacting any branches by switching back to a branch.',
    '',
    'If you want to create a new branch to retain commits you create, you may',
    'do so (now or later) by using -c with the switch command. Example:',
    '',
    '  git switch -c <new-branch-name>',
    '',
    'Or undo this operation with:',
    '',
    '  git switch -',
    '',
    'Turn off this advice by setting config variable advice.detachedHead to false',
    '',
  ]
}
