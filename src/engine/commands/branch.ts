import type { GitDir, Oid } from '../model/types.ts'
import { abbrev, isAncestor } from '../objects/store.ts'
import { parseArgs } from '../parser/options.ts'
import {
  branchRef,
  currentBranch,
  headOid,
  isValidBranchName,
  listBranches,
  resolveRevision,
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
  ])
  if (!parsed.ok) fail(cmd, parsed.error, 129)
  const { flags, positionals } = parsed.args
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
  if (positionals.length === 0 || flags.has('list')) {
    listAll(cmd, git)
    return
  }
  if (positionals.length > 2) fail(cmd, 'fatal: too many arguments')
  createBranch(cmd, git, positionals[0] as string, positionals[1], flags.has('force'))
}

function listAll(cmd: Cmd, git: GitDir): void {
  const current = currentBranch(git)
  if (current === null) {
    const head = headOid(git) as Oid
    const at = git.detachedAt === head ? 'at' : 'from'
    cmd.out.push(`* (HEAD detached ${at} ${abbrev(git, git.detachedAt ?? head)})`)
  }
  for (const name of listBranches(git)) cmd.out.push(`${name === current ? '*' : ' '} ${name}`)
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
  if (ref in git.refs && !force) fail(cmd, `fatal: a branch named '${name}' already exists`)
  if (force && name === currentBranch(git)) {
    fail(
      cmd,
      `fatal: cannot force update the branch '${name}' used by worktree at '${cmd.ws.path}'`,
    )
  }
  const start = startPoint ?? 'HEAD'
  const oid = resolveRevision(git, start)
  if (!oid) {
    const shown = startPoint ?? currentBranch(git) ?? 'HEAD'
    fail(cmd, `fatal: not a valid object name: '${shown}'`)
  }
  git.refs[ref] = oid
  cmd.events.push({ type: 'BRANCH_CREATED', name, oid })
  return oid
}

function deleteBranches(cmd: Cmd, git: GitDir, names: string[], force: boolean): void {
  let failed = false
  const head = headOid(git)
  for (const name of names) {
    const ref = branchRef(name)
    const oid = git.refs[ref]
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
    if (!force && !(head && isAncestor(git, oid, head))) {
      cmd.err.push(
        `error: the branch '${name}' is not fully merged`,
        `hint: If you are sure you want to delete it, run 'git branch -D ${name}'`,
      )
      failed = true
      continue
    }
    delete git.refs[ref]
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
  const unbornCurrent = from === current && !(fromRef in git.refs)
  if (!(fromRef in git.refs) && !unbornCurrent) {
    fail(cmd, `error: refname refs/heads/${from} not found\nfatal: branch rename failed`)
  }
  if (!isValidBranchName(to)) fail(cmd, `fatal: '${to}' is not a valid branch name`)
  const toRef = branchRef(to)
  if (toRef in git.refs && !force && from !== to) {
    fail(cmd, `fatal: a branch named '${to}' already exists`)
  }
  const oid = git.refs[fromRef]
  delete git.refs[fromRef]
  if (oid) git.refs[toRef] = oid
  if (from === current) git.head = { type: 'symbolic', ref: toRef }
  cmd.events.push({ type: 'BRANCH_RENAMED', from, to })
}
