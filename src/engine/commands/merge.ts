import { diffstat, diffTrees, modeLines } from '../diff/treeDiff.ts'
import { abbrev, commitTree, isAncestor } from '../objects/store.ts'
import { parseArgs } from '../parser/options.ts'
import { currentBranch, headOid, resolveRevision } from '../refs.ts'
import { switchErrorLines, switchTrees } from '../worktree/checkout.ts'
import { abort, type Cmd, fail, requireRepo, unsupported } from './context.ts'

export function merge(cmd: Cmd, argv: string[]): void {
  const parsed = parseArgs(argv, [
    { name: 'ff-only', long: ['ff-only'] },
    { name: 'no-ff', long: ['no-ff'] },
    { name: 'ff', long: ['ff'] },
    { name: 'abort', long: ['abort'] },
    { name: 'message', short: 'm', value: true, multiple: true },
  ])
  if (!parsed.ok) fail(cmd, parsed.error, 129)
  const { flags, positionals } = parsed.args
  const git = requireRepo(cmd)
  if (flags.has('abort')) unsupported(cmd, 'git merge --abort')
  if (flags.has('no-ff')) unsupported(cmd, 'git merge --no-ff（マージコミットの作成）')
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
  if (!isAncestor(git, head, target)) {
    if (flags.has('ff-only')) fail(cmd, 'fatal: Not possible to fast-forward, aborting.')
    unsupported(cmd, 'fast-forward できないマージ（マージコミットの作成）')
  }

  cmd.out.push(`Updating ${abbrev(git, head)}..${abbrev(git, target)}`)
  const from = commitTree(git, head)
  const to = commitTree(git, target)
  const result = switchTrees(git, cmd.ws, from, to)
  if (!result.ok) {
    cmd.err.push(...switchErrorLines(result, 'merge'))
    abort(1)
  }
  if (git.head.type === 'symbolic') git.refs[git.head.ref] = target
  else git.head = { type: 'detached', oid: target }

  const changes = diffTrees(git, from, to)
  cmd.out.push('Fast-forward', ...diffstat(changes), ...modeLines(changes))
  cmd.events.push({ type: 'FAST_FORWARDED', branch: currentBranch(git), from: head, to: target })
}
