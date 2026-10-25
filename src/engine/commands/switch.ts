// git switch / git checkout（ブランチの切り替え部分）。

import type { GitDir, Oid } from '../model/types.ts'
import { abbrev, ancestors, commitTree, readCommit } from '../objects/store.ts'
import { parseArgs } from '../parser/options.ts'
import { branchRef, currentBranch, headOid, headPosition, resolveRevision } from '../refs.ts'
import { localChangeLines, switchErrorLines, switchTrees } from '../worktree/checkout.ts'
import { createBranch } from './branch.ts'
import { subjectOf } from './commit.ts'
import { abort, type Cmd, fail, requireRepo, unsupported } from './context.ts'

type Destination = { branch: string; created?: boolean } | { detach: Oid; spec: string }

export function switchCmd(cmd: Cmd, argv: string[]): void {
  const parsed = parseArgs(argv, [
    { name: 'create', short: 'c', long: ['create'], value: true },
    { name: 'force-create', short: 'C', long: ['force-create'], value: true },
    { name: 'detach', short: 'd', long: ['detach'] },
  ])
  if (!parsed.ok) fail(cmd, parsed.error, 129)
  const { flags, values, positionals } = parsed.args
  const git = requireRepo(cmd)

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
  if (branchRef(name) in git.refs) {
    moveHead(cmd, git, { branch: name })
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
  const parsed = parseArgs(argv, [
    { name: 'branch', short: 'b', value: true },
    { name: 'force-branch', short: 'B', value: true },
    { name: 'detach', long: ['detach'] },
  ])
  if (!parsed.ok) fail(cmd, parsed.error, 129)
  const { flags, values, positionals } = parsed.args
  const git = requireRepo(cmd)
  if (argv.includes('--')) unsupported(cmd, 'git checkout -- <file>（ファイルの復元）')

  const create = values.get('branch')?.[0] ?? values.get('force-branch')?.[0]
  if (create !== undefined) {
    if (positionals.length > 1) unsupported(cmd, 'git checkout -b のファイル指定')
    startNewBranch(cmd, git, create, positionals[0], values.has('force-branch'))
    return
  }
  if (positionals.length === 0) fail(cmd, 'git-sensei: 切り替え先のブランチを指定してください', 1)
  if (positionals.length > 1) unsupported(cmd, 'git checkout <commit> <file>（ファイルの復元）')

  const spec = resolvePrevious(cmd, git, positionals[0] as string)
  if (!flags.has('detach') && branchRef(spec) in git.refs) {
    moveHead(cmd, git, { branch: spec })
    return
  }
  const oid = resolveRevision(git, spec)
  if (oid) {
    moveHead(cmd, git, { detach: oid, spec })
    return
  }
  if (spec in cmd.ws.files || Object.keys(git.index).some((p) => p === spec)) {
    unsupported(cmd, 'git checkout <file>（ファイルの復元）')
  }
  fail(cmd, `error: pathspec '${spec}' did not match any file(s) known to git`, 1)
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
    if (branchRef(name) in git.refs && !force)
      fail(cmd, `fatal: a branch named '${name}' already exists`)
    const from = headPosition(git)
    git.head = { type: 'symbolic', ref: branchRef(name) }
    cmd.err.push(`Switched to a new branch '${name}'`)
    cmd.events.push({ type: 'HEAD_MOVED', from, to: headPosition(git) })
    return
  }
  createBranch(cmd, git, name, start, force)
  moveHead(cmd, git, { branch: name, created: true })
}

export function moveHead(cmd: Cmd, git: GitDir, dest: Destination): void {
  const fromBranch = currentBranch(git)
  const fromOid = headOid(git)
  const from = headPosition(git)

  if ('branch' in dest && dest.branch === fromBranch && !dest.created) {
    cmd.err.push(`Already on '${dest.branch}'`)
    return
  }
  const toOid = 'branch' in dest ? (git.refs[branchRef(dest.branch)] ?? null) : dest.detach
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
