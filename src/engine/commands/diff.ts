// git diff と git show。差分は unified 形式（diff/unified.ts）。
import { countChanges } from '../diff/lines.ts'
import { diffstat, type FileChange } from '../diff/treeDiff.ts'
import { unifiedHunks } from '../diff/unified.ts'
import { formatGitDate } from '../format/date.ts'
import { has, own } from '../model/dict.ts'
import type { FileMode, FilePath, GitDir, Oid } from '../model/types.ts'
import { hashBlob } from '../objects/serialize.ts'
import { abbrev, commitTree, type FlatTree, readBlob, readCommit } from '../objects/store.ts'
import { parseArgs } from '../parser/options.ts'
import { resolveRevision } from '../refs.ts'
import { pathspecMatcher } from '../worktree/pathspec.ts'
import { subjectOf } from './commit.ts'
import { type Cmd, fail, requireRepo, requireWorktree, unsupported } from './context.ts'
import { decorations, expandTabs } from './log.ts'

/** 差分の片側。ファイルがなければ null */
type Side = { oid: Oid; mode: FileMode; text: string } | null

const ZERO = '0000000'

const ambiguous = (arg: string) =>
  [
    `fatal: ambiguous argument '${arg}': unknown revision or path not in the working tree.`,
    "Use '--' to separate paths from revisions, like this:",
    "'git <command> [<revision>...] -- [<file>...]'",
  ].join('\n')

/** 1つのファイルの差分（diff --git の見出し＋ハンク） */
function fileDiff(git: GitDir, path: FilePath, a: Side, b: Side): string[] {
  const lines = [`diff --git a/${path} b/${path}`]
  const short = (s: Side) => (s ? abbrev(git, s.oid) : ZERO)
  if (!a && b) {
    lines.push(`new file mode ${b.mode}`, `index ${ZERO}..${short(b)}`)
  } else if (a && !b) {
    lines.push(`deleted file mode ${a.mode}`, `index ${short(a)}..${ZERO}`)
  } else if (a && b && a.mode !== b.mode) {
    lines.push(`old mode ${a.mode}`, `new mode ${b.mode}`)
    if (a.oid !== b.oid) lines.push(`index ${short(a)}..${short(b)}`)
  } else {
    lines.push(`index ${short(a)}..${short(b)} ${(b ?? a)?.mode}`)
  }
  const hunks = unifiedHunks(a?.text ?? '', b?.text ?? '')
  if (hunks.length > 0) {
    lines.push(
      a ? `--- a/${path}` : '--- /dev/null',
      b ? `+++ b/${path}` : '+++ /dev/null',
      ...hunks,
    )
  }
  return lines
}

const fromTree = (git: GitDir, tree: FlatTree, path: FilePath): Side => {
  const e = own(tree, path)
  return e ? { oid: e.oid, mode: e.mode, text: readBlob(git, e.oid).content } : null
}

type Format = 'patch' | 'stat' | 'name-only' | 'name-status'

/** 差分の一覧を、指定の形式で出力する */
function emit(
  cmd: Cmd,
  git: GitDir,
  pairs: { path: FilePath; a: Side; b: Side }[],
  format: Format,
): void {
  const changed = pairs.filter(
    ({ a, b }) => !(a && b && a.oid === b.oid && a.mode === b.mode) && (a || b),
  )
  if (format === 'name-only') {
    cmd.out.push(...changed.map((c) => c.path))
  } else if (format === 'name-status') {
    cmd.out.push(...changed.map((c) => `${!c.a ? 'A' : !c.b ? 'D' : 'M'}\t${c.path}`))
  } else if (format === 'stat') {
    const changes: FileChange[] = changed.map(({ path, a, b }) => ({
      path,
      status: !a ? 'A' : !b ? 'D' : 'M',
      mode: (b ?? a)?.mode ?? '100644',
      ...countChanges(a?.text ?? '', b?.text ?? ''),
    }))
    cmd.out.push(...diffstat(changes))
  } else {
    for (const { path, a, b } of changed) cmd.out.push(...fileDiff(git, path, a, b))
  }
}

/** -- の前後で、コミットとファイルを分ける。-- がなければ、コミットとして読めるものをコミットにする */
function splitArgs(
  cmd: Cmd,
  git: GitDir,
  argv: string[],
  positionals: string[],
  known: FilePath[],
): { revs: string[]; specs: string[] } {
  const dashdash = argv.indexOf('--')
  if (dashdash !== -1) {
    const after = argv.length - dashdash - 1
    return {
      revs: positionals.slice(0, positionals.length - after),
      specs: argv.slice(dashdash + 1),
    }
  }
  const revs: string[] = []
  const specs: string[] = []
  for (const arg of positionals) {
    if (specs.length === 0 && resolveRange(git, arg)) revs.push(arg)
    else if (known.some(pathspecMatcher(arg))) specs.push(arg)
    else fail(cmd, ambiguous(arg))
  }
  return { revs, specs }
}

/** "A..B" ならその2つ、"A" ならそれだけ。解決できなければ null */
function resolveRange(git: GitDir, arg: string): Oid[] | null {
  const m = /^(.*?)\.\.(\.?)(.*)$/.exec(arg)
  if (m) {
    if (m[2]) return null
    const a = resolveRevision(git, m[1] || 'HEAD')
    const b = resolveRevision(git, m[3] || 'HEAD')
    return a && b ? [a, b] : null
  }
  const oid = resolveRevision(git, arg)
  return oid ? [oid] : null
}

export function diff(cmd: Cmd, argv: string[]): void {
  const parsed = parseArgs(argv, [
    { name: 'cached', long: ['cached', 'staged'] },
    { name: 'stat', long: ['stat'] },
    { name: 'name-only', long: ['name-only'] },
    { name: 'name-status', long: ['name-status'] },
  ])
  if (!parsed.ok) fail(cmd, parsed.error, 129)
  const { flags, positionals } = parsed.args
  const git = requireWorktree(cmd)
  const format: Format = flags.has('stat')
    ? 'stat'
    : flags.has('name-only')
      ? 'name-only'
      : flags.has('name-status')
        ? 'name-status'
        : 'patch'

  const known = [
    ...new Set([
      ...Object.keys(cmd.ws.files),
      ...Object.keys(git.index),
      ...Object.keys(git.unmerged),
    ]),
  ]
  const { revs, specs } = splitArgs(cmd, git, argv, positionals, known)
  const oids = revs.flatMap((r) => {
    const hit = resolveRange(git, r)
    if (!hit) fail(cmd, ambiguous(r))
    return hit
  })
  if (oids.length > 2) unsupported(cmd, '3つ以上のコミットを並べた git diff')
  const inScope = (p: FilePath) => specs.length === 0 || specs.some((s) => pathspecMatcher(s)(p))
  const worktreeSide = (path: FilePath, mode: FileMode | undefined): Side => {
    const text = own(cmd.ws.files, path)
    return text === undefined ? null : { oid: hashBlob(text), mode: mode ?? '100644', text }
  }
  const indexSide = (path: FilePath): Side => fromTree(git, git.index, path)

  if (flags.has('cached')) {
    if (oids.length > 1) fail(cmd, 'usage: git diff [<options>] [<commit>] [--] [<path>...]', 129)
    const base = oids[0] ?? resolveRevision(git, 'HEAD')
    const tree = commitTree(git, base ?? null)
    const paths = [
      ...new Set([...Object.keys(tree), ...Object.keys(git.index), ...Object.keys(git.unmerged)]),
    ]
      .filter(inScope)
      .sort()
    for (const path of paths) {
      if (has(git.unmerged, path)) {
        if (format === 'patch' || format === 'stat') cmd.out.push(`* Unmerged path ${path}`)
        else if (format === 'name-status') cmd.out.push(`U\t${path}`)
        else cmd.out.push(path)
        continue
      }
      emit(cmd, git, [{ path, a: fromTree(git, tree, path), b: indexSide(path) }], format)
    }
    return
  }

  if (oids.length === 2) {
    const [a, b] = oids as [Oid, Oid]
    const ta = commitTree(git, a)
    const tb = commitTree(git, b)
    const paths = [...new Set([...Object.keys(ta), ...Object.keys(tb)])].filter(inScope).sort()
    emit(
      cmd,
      git,
      paths.map((path) => ({ path, a: fromTree(git, ta, path), b: fromTree(git, tb, path) })),
      format,
    )
    return
  }

  const unmerged = Object.keys(git.unmerged).filter(inScope)
  if (unmerged.length > 0) {
    unsupported(
      cmd,
      'コンフリクト中のファイルの git diff（diff --cc）。ファイルをエディタで開くと、印のついた行が見られます',
    )
  }
  if (oids.length === 1) {
    const tree = commitTree(git, oids[0] as Oid)
    const paths = [...new Set([...Object.keys(tree), ...Object.keys(git.index)])]
      .filter(inScope)
      .sort()
    emit(
      cmd,
      git,
      paths.map((path) => ({
        path,
        a: fromTree(git, tree, path),
        b: has(git.index, path) ? worktreeSide(path, own(git.index, path)?.mode) : null,
      })),
      format,
    )
    return
  }
  const paths = Object.keys(git.index).filter(inScope).sort()
  emit(
    cmd,
    git,
    paths.map((path) => ({
      path,
      a: indexSide(path),
      b: worktreeSide(path, own(git.index, path)?.mode),
    })),
    format,
  )
}

export function show(cmd: Cmd, argv: string[]): void {
  const parsed = parseArgs(argv, [
    { name: 'stat', long: ['stat'] },
    { name: 'name-only', long: ['name-only'] },
    { name: 'name-status', long: ['name-status'] },
    { name: 'oneline', long: ['oneline'] },
    { name: 'no-patch', short: 's', long: ['no-patch'] },
  ])
  if (!parsed.ok) fail(cmd, parsed.error, 129)
  const { flags, positionals } = parsed.args
  const git = requireRepo(cmd)
  const format: Format | 'none' = flags.has('no-patch')
    ? 'none'
    : flags.has('stat')
      ? 'stat'
      : flags.has('name-only')
        ? 'name-only'
        : flags.has('name-status')
          ? 'name-status'
          : 'patch'
  const specs = positionals.length > 0 ? positionals : ['HEAD']
  const deco = cmd.ctx.tty ? decorations(git) : new Map<Oid, string>()

  specs.forEach((spec, n) => {
    // REV:path（そのコミットのファイルの中身）。:path なら index
    const colon = spec.indexOf(':')
    if (colon !== -1) {
      showBlob(cmd, git, spec.slice(0, colon), spec.slice(colon + 1))
      return
    }
    const oid = resolveRevision(git, spec)
    if (!oid) fail(cmd, ambiguous(spec))
    const c = readCommit(git, oid)
    const d = deco.get(oid)
    if (n > 0) cmd.out.push('')
    if (flags.has('oneline')) {
      cmd.out.push(`${abbrev(git, oid)} ${d ? `(${d}) ` : ''}${subjectOf(c.message)}`)
    } else {
      cmd.out.push(`commit ${oid}${d ? ` (${d})` : ''}`)
      if (c.parents.length > 1) {
        cmd.out.push(`Merge: ${c.parents.map((p) => abbrev(git, p)).join(' ')}`)
      }
      cmd.out.push(`Author: ${c.author.name} <${c.author.email}>`)
      cmd.out.push(`Date:   ${formatGitDate(c.author.timestamp, c.author.tzOffset)}`)
      cmd.out.push('')
      for (const line of c.message.replace(/\n$/, '').split('\n')) {
        cmd.out.push(`    ${expandTabs(line)}`)
      }
    }
    if (format === 'none') return

    const after = commitTree(git, oid)
    if (c.parents.length > 1) {
      // マージコミット：どの親とも違うファイル（コンフリクトを手で解消したところ）だけを見せるのが本物（--cc）
      const resolved = Object.keys(after).filter((p) =>
        c.parents.every((parent) => own(commitTree(git, parent), p)?.oid !== own(after, p)?.oid),
      )
      // 本物は、差分がなくても見出しの後に空行を出す
      cmd.out.push('')
      if (resolved.length > 0) {
        cmd.err.push(
          `git-sensei: マージで手直ししたファイル（${resolved.join(', ')}）の差分（diff --cc）は、まだ表示できません。git diff ${abbrev(git, c.parents[0] as Oid)} ${abbrev(git, oid)} で、1つめの親との差分を見られます`,
        )
      }
      return
    }
    const before = commitTree(git, c.parents[0] ?? null)
    const paths = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
    const pairs = paths.map((path) => ({
      path,
      a: fromTree(git, before, path),
      b: fromTree(git, after, path),
    }))
    const start = cmd.out.length
    emit(cmd, git, pairs, format)
    // 見出しと差分の間に空行（--oneline のときは入れない）
    if (cmd.out.length > start && !flags.has('oneline')) cmd.out.splice(start, 0, '')
  })
}

/** git show REV:path */
function showBlob(cmd: Cmd, git: GitDir, rev: string, rawPath: string): void {
  let path = rawPath
  while (path.startsWith('./')) path = path.slice(2)
  if (rev === '') {
    const e = own(git.index, path)
    if (!e) fail(cmd, `fatal: path '${path}' does not exist (neither on disk nor in the index)`)
    pushBlob(cmd, readBlob(git, e.oid).content)
    return
  }
  const oid = resolveRevision(git, rev)
  if (!oid) fail(cmd, `fatal: invalid object name '${rev}'.`)
  const e = own(commitTree(git, oid), path)
  if (!e) {
    if (has(cmd.ws.files, path))
      fail(cmd, `fatal: path '${path}' exists on disk, but not in '${rev}'`)
    fail(cmd, `fatal: path '${path}' does not exist in '${rev}'`)
  }
  pushBlob(cmd, readBlob(git, e.oid).content)
}

/** ファイルの中身をそのまま出す（空なら何も出さない） */
function pushBlob(cmd: Cmd, content: string): void {
  if (content !== '') cmd.out.push(content.replace(/\n$/, ''))
}
