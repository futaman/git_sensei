// git reset：ブランチ（HEAD）を動かす。--soft は HEAD だけ、--mixed（既定）は index も、--hard は作業ツリーも。
// ファイルを指定したときは、そのファイルの index だけをコミットの内容に戻す（ステージから降ろす）。
import { has, own } from '../model/dict.ts'
import type { FilePath, GitDir, Oid } from '../model/types.ts'
import { hashBlob } from '../objects/serialize.ts'
import { abbrev, commitTree, readBlob, readCommit } from '../objects/store.ts'
import { parseArgs } from '../parser/options.ts'
import { currentBranch, headOid, resolveRevision } from '../refs.ts'
import { pathspecMatcher } from '../worktree/pathspec.ts'
import { subjectOf } from './commit.ts'
import { type Cmd, fail, requireWorktree, unsupported } from './context.ts'

/** "Unstaged changes after reset:" に続く、作業ツリーと index が違うファイル */
function unstagedLines(git: GitDir, cmd: Cmd): string[] {
  const lines: string[] = []
  for (const [path, entry] of Object.entries(git.index).sort(([a], [b]) => (a < b ? -1 : 1))) {
    const content = own(cmd.ws.files, path)
    if (content === undefined) lines.push(`D\t${path}`)
    else if (hashBlob(content) !== entry.oid) lines.push(`M\t${path}`)
  }
  return lines
}

const AMBIGUOUS = (arg: string) =>
  [
    `fatal: ambiguous argument '${arg}': unknown revision or path not in the working tree.`,
    "Use '--' to separate paths from revisions, like this:",
    "'git <command> [<revision>...] -- [<file>...]'",
  ].join('\n')

export function reset(cmd: Cmd, argv: string[]): void {
  const parsed = parseArgs(argv, [
    { name: 'soft', long: ['soft'] },
    { name: 'mixed', long: ['mixed'] },
    { name: 'hard', long: ['hard'] },
    { name: 'merge', long: ['merge'] },
    { name: 'keep', long: ['keep'] },
    { name: 'quiet', short: 'q', long: ['quiet'] },
  ])
  if (!parsed.ok) fail(cmd, parsed.error, 129)
  const { flags, positionals } = parsed.args
  const git = requireWorktree(cmd)
  if (flags.has('merge') || flags.has('keep')) unsupported(cmd, 'git reset --merge / --keep')
  const modes = (['soft', 'mixed', 'hard'] as const).filter((m) => flags.has(m))
  const mode = modes.at(-1) ?? 'mixed'
  const quiet = flags.has('quiet')
  const head = headOid(git)
  if (head === null) unsupported(cmd, 'まだコミットがないブランチでの git reset')

  // 引数を、コミットとファイルに分ける
  const dashdash = argv.indexOf('--')
  let rev = 'HEAD'
  let paths: string[] = []
  if (dashdash !== -1) {
    const before = positionals.slice(0, positionals.length - (argv.length - dashdash - 1))
    if (before.length > 1) fail(cmd, AMBIGUOUS(before[1] as string))
    rev = before[0] ?? 'HEAD'
    paths = argv.slice(dashdash + 1)
  } else if (positionals.length > 0) {
    const [first, ...rest] = positionals as [string, ...string[]]
    if (resolveRevision(git, first)) {
      rev = first
      paths = rest
    } else {
      paths = positionals
    }
    // ファイルとして存在しないものは、コミットの指定の間違いとみなす
    for (const p of paths) {
      const match = pathspecMatcher(p)
      const known = [
        ...Object.keys(cmd.ws.files),
        ...Object.keys(git.index),
        ...Object.keys(git.unmerged),
      ]
      if (!known.some(match)) fail(cmd, AMBIGUOUS(p))
    }
  }
  const target = resolveRevision(git, rev)
  if (!target) fail(cmd, AMBIGUOUS(rev))

  if (paths.length > 0) {
    if (mode === 'hard') fail(cmd, 'fatal: Cannot do hard reset with paths.')
    if (mode === 'soft') fail(cmd, 'fatal: Cannot do soft reset with paths.')
    resetPaths(cmd, git, target, paths, quiet)
    return
  }

  if (mode === 'soft' && (git.merge || Object.keys(git.unmerged).length > 0)) {
    fail(cmd, 'fatal: Cannot do a soft reset in the middle of a merge.')
  }

  const before = { head, index: { ...git.index } }
  const to = commitTree(git, target)
  const discarded: FilePath[] = []

  if (mode === 'mixed' || mode === 'hard') {
    const old = commitTree(git, head)
    const paths = new Set([
      ...Object.keys(git.index),
      ...Object.keys(git.unmerged),
      ...Object.keys(old),
      ...Object.keys(to),
    ])
    for (const path of paths) {
      const t = own(to, path)
      if (mode === 'hard') {
        const tracked =
          has(git.index, path) || has(git.unmerged, path) || has(old, path) || t !== undefined
        if (tracked) {
          const now = own(cmd.ws.files, path)
          const next = t ? readBlob(git, t.oid).content : undefined
          if (now !== undefined && now !== next && !has(git.objects, hashBlob(now))) {
            discarded.push(path)
          }
          if (next !== undefined) cmd.ws.files[path] = next
          else delete cmd.ws.files[path]
        }
      }
      delete git.unmerged[path]
      if (t) git.index[path] = { ...t }
      else delete git.index[path]
    }
    git.merge = null
  }

  git.origHead = head
  if (git.head.type === 'symbolic') git.refs[git.head.ref] = target
  else git.head = { type: 'detached', oid: target }

  if (mode === 'hard') {
    if (!quiet)
      cmd.out.push(
        `HEAD is now at ${abbrev(git, target)} ${subjectOf(readCommit(git, target).message)}`,
      )
  } else if (mode === 'mixed' && !quiet) {
    const lines = unstagedLines(git, cmd)
    if (lines.length > 0) cmd.out.push('Unstaged changes after reset:', ...lines)
  }

  const unstaged = Object.keys({ ...before.index, ...git.index }).filter(
    (p) => own(before.index, p)?.oid !== own(git.index, p)?.oid,
  )
  if (mode === 'mixed' && unstaged.length > 0) {
    cmd.events.push({ type: 'FILES_UNSTAGED', paths: unstaged.sort() })
  }
  if (target !== head) {
    cmd.events.push({ type: 'RESET', mode, branch: currentBranch(git), from: head, to: target })
  }
  if (discarded.length > 0) {
    cmd.events.push({ type: 'CHANGES_DISCARDED', paths: discarded.sort(), bulk: true })
  }
}

/** git reset [<commit>] -- <file>：そのファイルの index をコミットの内容にする */
function resetPaths(cmd: Cmd, git: GitDir, target: Oid, specs: string[], quiet: boolean): void {
  const tree = commitTree(git, target)
  const candidates = [
    ...new Set([...Object.keys(git.index), ...Object.keys(git.unmerged), ...Object.keys(tree)]),
  ]
  const changed: FilePath[] = []
  for (const path of candidates.sort()) {
    if (!specs.some((s) => pathspecMatcher(s)(path))) continue
    const t = own(tree, path)
    const i = own(git.index, path)
    if (t?.oid === i?.oid && t?.mode === i?.mode && !has(git.unmerged, path)) continue
    delete git.unmerged[path]
    if (t) git.index[path] = { ...t }
    else delete git.index[path]
    changed.push(path)
  }
  if (!quiet) {
    const lines = unstagedLines(git, cmd)
    if (lines.length > 0) cmd.out.push('Unstaged changes after reset:', ...lines)
  }
  if (changed.length > 0) cmd.events.push({ type: 'FILES_UNSTAGED', paths: changed })
}
