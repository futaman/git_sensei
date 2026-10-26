import { dict, own } from '../model/dict.ts'
import { commitTree, isAncestor } from '../objects/store.ts'
import { parseArgs } from '../parser/options.ts'
import { branchRef, currentBranch, headOid, REMOTES, upstreamOf } from '../refs.ts'
import { defaultRemote } from '../remote/connect.ts'
import { switchErrorLines, switchTrees } from '../worktree/checkout.ts'
import { type Cmd, exitKeep, fail, requireWorktree, unsupported } from './context.ts'
import { fetchFrom } from './fetch.ts'
import { fastForward, mergeMessage, refuseWhileMerging, threeWayMerge } from './merge.ts'

const DIVERGED_HINT = [
  'hint: You have divergent branches and need to specify how to reconcile them.',
  'hint: You can do so by running one of the following commands sometime before',
  'hint: your next pull:',
  'hint:',
  'hint:   git config pull.rebase false  # merge',
  'hint:   git config pull.rebase true   # rebase',
  'hint:   git config pull.ff only       # fast-forward only',
  'hint:',
  'hint: You can replace "git config" with "git config --global" to set a default',
  'hint: preference for all repositories. You can also pass --rebase, --no-rebase,',
  'hint: or --ff-only on the command line to override the configured default per',
  'hint: invocation.',
  'fatal: Need to specify how to reconcile divergent branches.',
]

export function pull(cmd: Cmd, argv: string[]): void {
  const parsed = parseArgs(argv, [
    { name: 'ff-only', long: ['ff-only'] },
    { name: 'rebase', short: 'r', long: ['rebase'] },
    { name: 'no-rebase', long: ['no-rebase'] },
    { name: 'ff', long: ['ff'] },
    { name: 'no-ff', long: ['no-ff'] },
    { name: 'quiet', short: 'q', long: ['quiet'] },
  ])
  if (!parsed.ok) fail(cmd, parsed.error, 129)
  const { flags, positionals } = parsed.args
  const git = requireWorktree(cmd)
  refuseWhileMerging(cmd, git)
  const branch = currentBranch(git)
  const [remoteArg, ...branches] = positionals
  if (branches.length > 1) unsupported(cmd, '複数のブランチを一度に pull すること')

  const upstream = branch ? upstreamOf(git, branch) : null
  const remoteName = remoteArg ?? upstream?.remote ?? defaultRemote(git, branch)
  const mergeBranch =
    branches[0] ??
    (upstream && upstream.remote === remoteName
      ? upstream.merge.replace(/^refs\/heads\//, '')
      : null)

  function noTracking(remoteLabel: string): never {
    cmd.err.push(
      ...(branch === null
        ? ['You are not currently on a branch.']
        : ['There is no tracking information for the current branch.']),
      'Please specify which branch you want to merge with.',
      'See git-pull(1) for details.',
      '',
      '    git pull <remote> <branch>',
      '',
      ...(branch === null
        ? []
        : [
            'If you wish to set tracking information for this branch you can do so with:',
            '',
            `    git branch --set-upstream-to=${remoteLabel}/<branch> ${branch}`,
            '',
          ]),
    )
    return exitKeep(1)
  }

  // リモートが1つもなければ、取りに行く先もない（関数宣言にして never で型を絞り込む）
  if (remoteName === null) noTracking('<remote>')
  const { remote } = fetchFrom(cmd, git, remoteName, branches.length > 0 ? { branches } : {})
  if (mergeBranch === null) noTracking(remoteName)

  const target =
    (remote.name ? own(git.refs, `${REMOTES}${remote.name}/${mergeBranch}`) : undefined) ??
    own(remote.git.refs, branchRef(mergeBranch))
  if (!target) fail(cmd, `fatal: couldn't find remote ref ${mergeBranch}`)

  const head = headOid(git)
  if (head === null) {
    // まだコミットがないブランチ：取ってきたものをそのまま展開する
    const result = switchTrees(git, cmd.ws, dict(), commitTree(git, target))
    if (!result.ok) {
      cmd.err.push(...switchErrorLines(result, 'merge'))
      exitKeep(1)
    }
    if (git.head.type === 'symbolic') git.refs[git.head.ref] = target
    cmd.events.push({ type: 'FAST_FORWARDED', branch, from: null, to: target })
    return
  }
  if (head === target || isAncestor(git, target, head)) {
    cmd.out.push('Already up to date.')
    return
  }
  if (isAncestor(git, head, target)) {
    if (!fastForward(cmd, git, head, target)) exitKeep(1)
    return
  }

  // 分岐している
  const ffOnly = flags.has('ff-only') || own(git.config, 'pull.ff') === 'only'
  const rebase =
    flags.has('rebase') || (own(git.config, 'pull.rebase') === 'true' && !flags.has('no-rebase'))
  const merge =
    flags.has('no-rebase') ||
    flags.has('ff') ||
    flags.has('no-ff') ||
    own(git.config, 'pull.rebase') === 'false'
  if (ffOnly) {
    cmd.err.push('fatal: Not possible to fast-forward, aborting.')
    exitKeep(128)
  }
  if (rebase) unsupported(cmd, 'git pull --rebase')
  if (merge) {
    // pull のマージは、取ってきたコミットを oid で渡したのと同じ（ラベルも oid になる）
    const url = remote.url.replace(/\/+$/, '').replace(/\.git$/, '')
    const result = threeWayMerge(cmd, git, {
      head,
      target,
      label: target,
      message: mergeMessage(git, target, { url, branch: mergeBranch }),
    })
    if (result === 'blocked') exitKeep(2)
    if (result === 'conflict') exitKeep(1)
    return
  }
  cmd.err.push(...DIVERGED_HINT)
  cmd.events.push({
    type: 'PULL_DIVERGED',
    branch: branch ?? 'HEAD',
    upstream: `${remote.name ?? remote.url}/${mergeBranch}`,
  })
  exitKeep(128)
}
