import { has, own } from '../model/dict.ts'
import type { GitDir, Oid } from '../model/types.ts'
import { abbrev, isAncestor } from '../objects/store.ts'
import { parseArgs } from '../parser/options.ts'
import {
  branchRef,
  currentBranch,
  headOid,
  isValidBranchName,
  listBranches,
  listRemoteBranches,
  listRemotes,
  REMOTES,
  resolveRevision,
  setUpstream,
  upstreamOf,
} from '../refs.ts'
import { type Cmd, exitKeep, fail, requireRepo } from './context.ts'

export function branch(cmd: Cmd, argv: string[]): void {
  const parsed = parseArgs(argv, [
    { name: 'delete', short: 'd', long: ['delete'] },
    { name: 'force-delete', short: 'D' },
    { name: 'force', short: 'f', long: ['force'] },
    { name: 'move', short: 'm', long: ['move'] },
    { name: 'force-move', short: 'M' },
    { name: 'show-current', long: ['show-current'] },
    { name: 'list', short: 'l', long: ['list'] },
    { name: 'all', short: 'a', long: ['all'] },
    { name: 'remotes', short: 'r', long: ['remotes'] },
    { name: 'set-upstream-to', short: 'u', long: ['set-upstream-to'], value: true },
    { name: 'unset-upstream', long: ['unset-upstream'] },
  ])
  if (!parsed.ok) fail(cmd, parsed.error, 129)
  const { flags, values, positionals } = parsed.args
  const git = requireRepo(cmd)

  if (flags.has('show-current')) {
    const name = currentBranch(git)
    if (name !== null) cmd.out.push(name)
    return
  }
  if (flags.has('delete') || flags.has('force-delete')) {
    const force = flags.has('force-delete') || flags.has('force')
    if (positionals.length === 0) fail(cmd, 'fatal: branch name required')
    deleteBranches(cmd, git, positionals, force)
    return
  }
  if (flags.has('move') || flags.has('force-move')) {
    renameBranch(cmd, git, positionals, flags.has('force-move') || flags.has('force'))
    return
  }
  const upstreamTo = values.get('set-upstream-to')?.[0]
  if (upstreamTo !== undefined) {
    setUpstreamTo(cmd, git, upstreamTo, positionals[0])
    return
  }
  if (flags.has('unset-upstream')) {
    const name = positionals[0] ?? currentBranch(git)
    if (name === null || !upstreamOf(git, name)) {
      fail(cmd, `fatal: branch '${name ?? 'HEAD'}' has no upstream information`)
    }
    delete git.config[`branch.${name}.remote`]
    delete git.config[`branch.${name}.merge`]
    return
  }
  if (positionals.length === 0 || flags.has('list') || flags.has('all') || flags.has('remotes')) {
    listAll(cmd, git, flags.has('all') ? 'all' : flags.has('remotes') ? 'remotes' : 'local')
    return
  }
  if (positionals.length > 2) fail(cmd, 'fatal: too many arguments')
  createBranch(cmd, git, positionals[0] as string, positionals[1], flags.has('force'))
}

function listAll(cmd: Cmd, git: GitDir, which: 'local' | 'remotes' | 'all'): void {
  if (which !== 'remotes') {
    const current = currentBranch(git)
    if (current === null) {
      const head = headOid(git) as Oid
      const at = git.detachedAt === head ? 'at' : 'from'
      cmd.out.push(`* (HEAD detached ${at} ${abbrev(git, git.detachedAt ?? head)})`)
    }
    for (const name of listBranches(git)) cmd.out.push(`${name === current ? '*' : ' '} ${name}`)
  }
  if (which === 'local') return
  const prefix = which === 'all' ? 'remotes/' : ''
  const names = [
    ...listRemoteBranches(git),
    ...Object.keys(git.symrefs)
      .filter((r) => r.startsWith(REMOTES))
      .map((r) => r.slice(REMOTES.length)),
  ].sort()
  for (const name of names) {
    const target = own(git.symrefs, REMOTES + name)
    cmd.out.push(`  ${prefix}${name}${target ? ` -> ${target.slice(REMOTES.length)}` : ''}`)
  }
}

/** 'origin/main' のような名前を、リモート名とブランチ名に分ける（その追跡ブランチがあるときだけ） */
function splitRemoteBranch(git: GitDir, name: string): { remote: string; branch: string } | null {
  const short = name.replace(/^refs\/remotes\//, '')
  if (!has(git.refs, REMOTES + short)) return null
  for (const remote of listRemotes(git)) {
    if (short.startsWith(`${remote}/`)) return { remote, branch: short.slice(remote.length + 1) }
  }
  return null
}

function upstreamSetLine(cmd: Cmd, local: string, remote: string, branch: string): void {
  cmd.out.push(`branch '${local}' set up to track '${remote}/${branch}'.`)
  cmd.events.push({ type: 'UPSTREAM_SET', branch: local, upstream: `${remote}/${branch}` })
}

function setUpstreamTo(cmd: Cmd, git: GitDir, upstream: string, name: string | undefined): void {
  const local = name ?? currentBranch(git)
  if (local === null)
    fail(cmd, 'fatal: could not set upstream of HEAD when it does not point to any branch')
  if (!has(git.refs, branchRef(local))) fail(cmd, `fatal: branch '${local}' does not exist`)
  const target = splitRemoteBranch(git, upstream)
  if (!target) {
    fail(
      cmd,
      [
        `fatal: the requested upstream branch '${upstream}' does not exist`,
        'hint: ',
        'hint: If you are planning on basing your work on an upstream',
        'hint: branch that already exists at the remote, you may need to',
        'hint: run "git fetch" to retrieve it.',
      ].join('\n'),
    )
  }
  setUpstream(git, local, target.remote, target.branch)
  upstreamSetLine(cmd, local, target.remote, target.branch)
}

export function createBranch(
  cmd: Cmd,
  git: GitDir,
  name: string,
  startPoint: string | undefined,
  force: boolean,
): Oid {
  if (!isValidBranchName(name)) fail(cmd, `fatal: '${name}' is not a valid branch name`)
  const ref = branchRef(name)
  if (has(git.refs, ref) && !force) fail(cmd, `fatal: a branch named '${name}' already exists`)
  if (force && name === currentBranch(git)) refuseCurrentBranch(cmd, name)
  const start = startPoint ?? 'HEAD'
  const oid = resolveRevision(git, start)
  if (!oid) {
    const shown = startPoint ?? currentBranch(git) ?? 'HEAD'
    fail(cmd, `fatal: not a valid object name: '${shown}'`)
  }
  git.refs[ref] = oid
  cmd.events.push({ type: 'BRANCH_CREATED', name, oid })
  // リモート追跡ブランチから作ったときは、それを上流にする（branch.autoSetupMerge の既定）
  const remote = startPoint !== undefined ? splitRemoteBranch(git, startPoint) : null
  if (remote) {
    setUpstream(git, name, remote.remote, remote.branch)
    upstreamSetLine(cmd, name, remote.remote, remote.branch)
  }
  return oid
}

/** 今いるブランチを -f / -M で上書きしようとしたとき。HEAD と index・作業ツリーがずれるので断る */
function refuseCurrentBranch(cmd: Cmd, name: string): never {
  fail(cmd, `fatal: cannot force update the branch '${name}' used by worktree at '${cmd.ws.path}'`)
}

function deleteBranches(cmd: Cmd, git: GitDir, names: string[], force: boolean): void {
  let failed = false
  const head = headOid(git)
  for (const name of names) {
    const ref = branchRef(name)
    const oid = own(git.refs, ref)
    if (!oid) {
      cmd.err.push(`error: branch '${name}' not found`)
      failed = true
      continue
    }
    if (name === currentBranch(git)) {
      cmd.err.push(`error: cannot delete branch '${name}' used by worktree at '${cmd.ws.path}'`)
      failed = true
      continue
    }
    // 上流があれば上流に、なければ HEAD にマージ済みかで判断する
    const upstream = upstreamOf(git, name)
    const upstreamOid = upstream ? own(git.refs, upstream.tracking) : undefined
    const mergedTo = upstreamOid ?? head
    if (!force && !(mergedTo && isAncestor(git, oid, mergedTo))) {
      cmd.err.push(
        `error: the branch '${name}' is not fully merged`,
        `hint: If you are sure you want to delete it, run 'git branch -D ${name}'`,
      )
      failed = true
      continue
    }
    if (!force && upstream && upstreamOid && !(head && isAncestor(git, oid, head))) {
      cmd.err.push(
        `warning: deleting branch '${name}' that has been merged to`,
        `         '${upstream.tracking}', but not yet merged to HEAD`,
      )
    }
    delete git.refs[ref]
    for (const key of Object.keys(git.config)) {
      if (key.startsWith(`branch.${name}.`)) delete git.config[key]
    }
    cmd.out.push(`Deleted branch ${name} (was ${abbrev(git, oid)}).`)
    cmd.events.push({ type: 'BRANCH_DELETED', name, oid, force })
  }
  // 消せたものは消したまま、終了コードだけ 1 にする（git と同じ）
  if (failed) exitKeep(1)
}

function renameBranch(cmd: Cmd, git: GitDir, positionals: string[], force: boolean): void {
  if (positionals.length === 0 || positionals.length > 2) fail(cmd, 'fatal: branch name required')
  const current = currentBranch(git)
  const [from, to] =
    positionals.length === 2
      ? (positionals as [string, string])
      : [current, positionals[0] as string]
  if (from === null) fail(cmd, 'fatal: cannot rename the current branch while not on any')
  const fromRef = branchRef(from)
  const unbornCurrent = from === current && !has(git.refs, fromRef)
  if (!has(git.refs, fromRef) && !unbornCurrent) {
    fail(cmd, `error: refname refs/heads/${from} not found\nfatal: branch rename failed`)
  }
  if (!isValidBranchName(to)) fail(cmd, `fatal: '${to}' is not a valid branch name`)
  const toRef = branchRef(to)
  if (has(git.refs, toRef) && from !== to) {
    if (!force) fail(cmd, `fatal: a branch named '${to}' already exists`)
    if (to === current) refuseCurrentBranch(cmd, to)
  }
  const oid = own(git.refs, fromRef)
  delete git.refs[fromRef]
  if (oid) git.refs[toRef] = oid
  for (const [key, value] of Object.entries(git.config)) {
    if (!key.startsWith(`branch.${from}.`)) continue
    delete git.config[key]
    git.config[`branch.${to}.${key.slice(`branch.${from}.`.length)}`] = value
  }
  if (from === current) git.head = { type: 'symbolic', ref: toRef }
  cmd.events.push({ type: 'BRANCH_RENAMED', from, to })
}
