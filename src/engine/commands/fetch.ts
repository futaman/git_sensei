import type { RefUpdate } from '../events.ts'
import type { GitDir } from '../model/types.ts'
import { abbrev, isAncestor } from '../objects/store.ts'
import { parseArgs } from '../parser/options.ts'
import { currentBranch, HEADS, REMOTES } from '../refs.ts'
import { defaultRemote, type OpenedRemote, openRemote } from '../remote/connect.ts'
import { copyObjects } from '../remote/transfer.ts'
import { type Cmd, fail, requireRepo } from './context.ts'

const SUMMARY_WIDTH = 17

/** "   abc1234..def5678" / " * [new branch]     " のような1行の前半 */
export function refLine(flag: string, summary: string): string {
  return ` ${flag} ${summary.padEnd(SUMMARY_WIDTH)}`
}

export interface FetchResult {
  remote: OpenedRemote
  updates: RefUpdate[]
}

/**
 * リモートのブランチを取り込み、refs/remotes/<remote>/* を更新する。
 * branches を指定したときは、そのブランチだけを取り込む
 */
export function fetchFrom(
  cmd: Cmd,
  git: GitDir,
  remoteName: string,
  opts: { branches?: string[]; prune?: boolean } = {},
): FetchResult {
  const remote = openRemote(cmd, git, remoteName)
  const tracking = remote.name ?? remoteName
  const srcBranches = Object.entries(remote.git.refs)
    .filter(([ref]) => ref.startsWith(HEADS))
    .map(([ref, oid]) => ({ name: ref.slice(HEADS.length), oid }))
  const wanted = opts.branches
    ? srcBranches.filter((b) => opts.branches?.includes(b.name))
    : srcBranches
  for (const name of opts.branches ?? []) {
    if (!srcBranches.some((b) => b.name === name))
      fail(cmd, `fatal: couldn't find remote ref ${name}`)
  }

  copyObjects(
    remote.git,
    git,
    wanted.map((b) => b.oid),
  )

  const updates: RefUpdate[] = []
  const lines: string[] = []
  const names = [...wanted.map((b) => b.name)]
  const nameWidth = Math.max(0, ...names.map((n) => n.length))
  for (const b of wanted) {
    const ref = `${REMOTES}${tracking}/${b.name}`
    const old = git.refs[ref] ?? null
    if (old === b.oid) continue
    const forced = old !== null && !isAncestor(git, old, b.oid)
    git.refs[ref] = b.oid
    updates.push({ branch: b.name, from: old, to: b.oid, forced })
    const target = `${tracking}/${b.name}`
    if (old === null) {
      lines.push(`${refLine('*', '[new branch]')} ${b.name.padEnd(nameWidth)} -> ${target}`)
    } else if (forced) {
      lines.push(
        `${refLine('+', `${abbrev(git, old)}...${abbrev(git, b.oid)}`)} ${b.name.padEnd(nameWidth)} -> ${target}  (forced update)`,
      )
    } else {
      lines.push(
        `${refLine(' ', `${abbrev(git, old)}..${abbrev(git, b.oid)}`)} ${b.name.padEnd(nameWidth)} -> ${target}`,
      )
    }
  }

  if (opts.prune && !opts.branches) {
    const prefix = `${REMOTES}${tracking}/`
    for (const ref of Object.keys(git.refs).sort()) {
      if (!ref.startsWith(prefix)) continue
      const name = ref.slice(prefix.length)
      if (srcBranches.some((b) => b.name === name)) continue
      updates.push({ branch: name, from: git.refs[ref] ?? null, to: null, forced: false })
      delete git.refs[ref]
      lines.push(
        `${refLine('-', '[deleted]')} ${'(none)'.padEnd(nameWidth)} -> ${tracking}/${name}`,
      )
    }
  }

  // git は From の行で URL の末尾の / と .git を省く
  const shown = remote.url.replace(/\/+$/, '').replace(/\.git$/, '')
  if (lines.length > 0) cmd.err.push(`From ${shown}`, ...lines)
  if (updates.length > 0) cmd.events.push({ type: 'FETCHED', remote: tracking, updates })
  return { remote, updates }
}

export function fetch(cmd: Cmd, argv: string[]): void {
  const parsed = parseArgs(argv, [
    { name: 'prune', short: 'p', long: ['prune'] },
    { name: 'quiet', short: 'q', long: ['quiet'] },
  ])
  if (!parsed.ok) fail(cmd, parsed.error, 129)
  const { flags, positionals } = parsed.args
  const git = requireRepo(cmd)
  const [name, ...branches] = positionals
  const remoteName = name ?? defaultRemote(git, currentBranch(git))
  if (remoteName === null) {
    fail(
      cmd,
      [
        'fatal: No remote repository specified.  Please, specify either a URL or a',
        'remote name from which new revisions should be fetched.',
      ].join('\n'),
    )
  }
  const errBefore = cmd.err.length
  fetchFrom(cmd, git, remoteName, {
    ...(branches.length > 0 ? { branches } : {}),
    prune: flags.has('prune'),
  })
  if (flags.has('quiet')) cmd.err.splice(errBefore)
}
