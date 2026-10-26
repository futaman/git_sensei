import type { PushRejectReason, RefUpdate } from '../events.ts'
import type { Oid } from '../model/types.ts'
import { abbrev, isAncestor, readCommit } from '../objects/store.ts'
import { parseArgs } from '../parser/options.ts'
import {
  branchRef,
  currentBranch,
  HEADS,
  REMOTES,
  resolveRevision,
  setUpstream,
  upstreamOf,
} from '../refs.ts'
import { defaultRemote, openRemote } from '../remote/connect.ts'
import { commitsOnlyIn, copyObjects } from '../remote/transfer.ts'
import { type Cmd, exitKeep, fail, requireRepo } from './context.ts'
import { refLine } from './fetch.ts'

interface PushSpec {
  /** 表示に使う送り元の名前（main / HEAD）。削除のときは null */
  src: string | null
  /** 送り元のブランチ名（-u で上流を設定できるのはブランチのときだけ） */
  srcBranch: string | null
  oid: Oid | null
  /** リモート側のブランチ名 */
  dst: string
  force: boolean
}

const HINTS: Record<'fetch-first' | 'non-fast-forward', string[]> = {
  'fetch-first': [
    'hint: Updates were rejected because the remote contains work that you do not',
    'hint: have locally. This is usually caused by another repository pushing to',
    'hint: the same ref. If you want to integrate the remote changes, use',
    "hint: 'git pull' before pushing again.",
    "hint: See the 'Note about fast-forwards' in 'git push --help' for details.",
  ],
  'non-fast-forward': [
    'hint: Updates were rejected because the tip of your current branch is behind',
    'hint: its remote counterpart. If you want to integrate the remote changes,',
    "hint: use 'git pull' before pushing again.",
    "hint: See the 'Note about fast-forwards' in 'git push --help' for details.",
  ],
}

export function push(cmd: Cmd, argv: string[]): void {
  const parsed = parseArgs(argv, [
    { name: 'set-upstream', short: 'u', long: ['set-upstream'] },
    { name: 'force', short: 'f', long: ['force'] },
    { name: 'force-with-lease', long: ['force-with-lease'] },
    { name: 'delete', short: 'd', long: ['delete'] },
    { name: 'quiet', short: 'q', long: ['quiet'] },
  ])
  if (!parsed.ok) fail(cmd, parsed.error, 129)
  const { flags, positionals } = parsed.args
  const git = requireRepo(cmd)
  const branch = currentBranch(git)
  const [remoteArg, ...rawSpecs] = positionals

  const remoteName = remoteArg ?? defaultRemote(git, branch)
  if (remoteName === null) {
    fail(
      cmd,
      [
        'fatal: No configured push destination.',
        'Either specify the URL from the command-line or configure a remote repository using',
        '',
        '    git remote add <name> <url>',
        '',
        'and then push using the remote name',
        '',
        '    git push <name>',
        '',
      ].join('\n'),
    )
  }
  const remote = openRemote(cmd, git, remoteName)
  const tracking = remote.name

  const specs: PushSpec[] = []
  if (rawSpecs.length === 0) {
    if (flags.has('delete')) fail(cmd, "fatal: --delete doesn't make sense without any refs")
    if (branch === null) {
      fail(
        cmd,
        [
          'fatal: You are not currently on a branch.',
          'To push the history leading to the current (detached HEAD)',
          'state now, use',
          '',
          `    git push ${remoteName} HEAD:<name-of-remote-branch>`,
          '',
        ].join('\n'),
      )
    }
    const upstream = upstreamOf(git, branch)
    if (!upstream) {
      fail(
        cmd,
        [
          `fatal: The current branch ${branch} has no upstream branch.`,
          'To push the current branch and set the remote as upstream, use',
          '',
          `    git push --set-upstream ${remoteName} ${branch}`,
          '',
          'To have this happen automatically for branches without a tracking',
          "upstream, see 'push.autoSetupRemote' in 'git help config'.",
          '',
        ].join('\n'),
      )
    }
    specs.push({
      src: branch,
      srcBranch: branch,
      oid: git.refs[branchRef(branch)] ?? null,
      dst: upstream.merge.slice(HEADS.length),
      force: false,
    })
  } else {
    for (const raw of rawSpecs) {
      const force = raw.startsWith('+')
      const s = force ? raw.slice(1) : raw
      const [left, right] = s.includes(':') ? (s.split(':', 2) as [string, string]) : [s, s]
      const dst = right.replace(/^refs\/heads\//, '')
      if (flags.has('delete') || left === '') {
        specs.push({
          src: null,
          srcBranch: null,
          oid: null,
          dst: flags.has('delete') ? left : dst,
          force,
        })
        continue
      }
      const srcBranch = left === 'HEAD' ? branch : left.replace(/^refs\/heads\//, '')
      const oid =
        (srcBranch !== null ? git.refs[branchRef(srcBranch)] : undefined) ??
        resolveRevision(git, left)
      if (!oid) {
        cmd.err.push(
          `error: src refspec ${left} does not match any`,
          `error: failed to push some refs to '${remote.url}'`,
        )
        exitKeep(1)
      }
      const isBranch = srcBranch !== null && branchRef(srcBranch) in git.refs
      specs.push({
        src: left,
        srcBranch: isBranch ? srcBranch : null,
        oid,
        dst: left === 'HEAD' && !s.includes(':') ? (branch ?? 'HEAD') : dst,
        force,
      })
    }
  }

  const lines: string[] = []
  const upstreamLines: string[] = []
  const updates: RefUpdate[] = []
  const rejected: { dst: string; reason: PushRejectReason }[] = []
  let upToDate = 0

  for (const spec of specs) {
    const dstRef = branchRef(spec.dst)
    const trackingRef = tracking ? `${REMOTES}${tracking}/${spec.dst}` : null
    const old = remote.git.refs[dstRef] ?? null

    if (spec.oid === null) {
      if (old === null) {
        cmd.err.push(`error: unable to delete '${spec.dst}': remote ref does not exist`)
        rejected.push({ dst: spec.dst, reason: 'non-fast-forward' })
        continue
      }
      delete remote.git.refs[dstRef]
      if (trackingRef) delete git.refs[trackingRef]
      lines.push(`${refLine('-', '[deleted]')} ${spec.dst}`)
      updates.push({ branch: spec.dst, from: old, to: null, forced: false })
      continue
    }

    const arrow = `${spec.src} -> ${spec.dst}`
    if (old === spec.oid) {
      upToDate++
      if (spec.srcBranch && flags.has('set-upstream') && tracking) {
        setUpstreamLine(spec.srcBranch, tracking, spec.dst)
      }
      continue
    }
    if (!remote.git.bare && remote.git.head.type === 'symbolic' && remote.git.head.ref === dstRef) {
      lines.push(`${refLine('!', '[remote rejected]')} ${arrow} (branch is currently checked out)`)
      rejected.push({ dst: spec.dst, reason: 'checked-out' })
      continue
    }

    let forced = false
    if (old !== null && !(old in git.objects && isAncestor(git, old, spec.oid))) {
      if (flags.has('force-with-lease')) {
        const expected = trackingRef ? (git.refs[trackingRef] ?? null) : null
        if (expected !== old) {
          lines.push(`${refLine('!', '[rejected]')} ${arrow} (stale info)`)
          rejected.push({ dst: spec.dst, reason: 'stale-info' })
          continue
        }
        forced = true
      } else if (flags.has('force') || spec.force) {
        forced = true
      } else {
        const reason = old in git.objects ? 'non-fast-forward' : 'fetch-first'
        lines.push(`${refLine('!', '[rejected]')} ${arrow} (${reason.replaceAll('-', ' ')})`)
        rejected.push({ dst: spec.dst, reason })
        continue
      }
    }

    copyObjects(git, remote.git, [spec.oid])
    if (forced && old !== null) {
      const lost = commitsOnlyIn(remote.git, old, spec.oid)
      if (lost.length > 0) {
        const authors = [...new Set(lost.map((o) => readCommit(remote.git, o).author.name))]
        cmd.events.push({
          type: 'FORCE_PUSH_OVERWROTE',
          remote: tracking ?? remote.url,
          branch: spec.dst,
          lostCommits: lost,
          authors,
        })
      }
    }
    remote.git.refs[dstRef] = spec.oid
    if (trackingRef) git.refs[trackingRef] = spec.oid
    updates.push({ branch: spec.dst, from: old, to: spec.oid, forced })

    if (old === null) {
      lines.push(`${refLine('*', '[new branch]')} ${arrow}`)
    } else if (forced) {
      lines.push(
        `${refLine('+', `${abbrev(git, old)}...${abbrev(git, spec.oid)}`)} ${arrow} (forced update)`,
      )
    } else {
      lines.push(`${refLine(' ', `${abbrev(git, old)}..${abbrev(git, spec.oid)}`)} ${arrow}`)
    }
    if (spec.srcBranch && flags.has('set-upstream') && tracking) {
      setUpstreamLine(spec.srcBranch, tracking, spec.dst)
    }
  }

  function setUpstreamLine(local: string, remoteName: string, dst: string) {
    setUpstream(git, local, remoteName, dst)
    upstreamLines.push(`branch '${local}' set up to track '${remoteName}/${dst}'.`)
    cmd.events.push({ type: 'UPSTREAM_SET', branch: local, upstream: `${remoteName}/${dst}` })
  }

  cmd.out.push(...upstreamLines)
  if (!flags.has('quiet')) {
    if (lines.length > 0) cmd.err.push(`To ${remote.url}`, ...lines)
    else if (upToDate > 0 && rejected.length === 0) cmd.err.push('Everything up-to-date')
  }
  if (updates.length > 0)
    cmd.events.push({ type: 'PUSHED', remote: tracking ?? remote.url, updates })

  if (rejected.length > 0) {
    cmd.err.push(`error: failed to push some refs to '${remote.url}'`)
    const hinted = rejected.find(
      (r) => r.reason === 'fetch-first' || r.reason === 'non-fast-forward',
    )
    if (hinted) cmd.err.push(...HINTS[hinted.reason as keyof typeof HINTS])
    for (const r of rejected) {
      cmd.events.push({
        type: 'PUSH_REJECTED',
        remote: tracking ?? remote.url,
        branch: r.dst,
        reason: r.reason,
      })
    }
    exitKeep(1)
  }
}
