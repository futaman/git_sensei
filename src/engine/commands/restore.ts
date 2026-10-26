// ファイルを元に戻す：git restore と、git checkout [<commit>] -- <file>。
// restore は既定で、元にないファイルを消す（no-overlay）。checkout は消さない（overlay）。
import { has, own } from '../model/dict.ts'
import type { FilePath, GitDir, IndexEntry, Oid } from '../model/types.ts'
import { hashBlob } from '../objects/serialize.ts'
import { abbrev, commitTree, type FlatTree, readBlob, readCommit } from '../objects/store.ts'
import { parseArgs } from '../parser/options.ts'
import { resolveRevision } from '../refs.ts'
import { pathspecMatcher } from '../worktree/pathspec.ts'
import { abort, type Cmd, fail, requireWorktree, unsupported } from './context.ts'

/** 作業ツリーのファイルを書き換える前に、どのオブジェクトにも残っていない内容なら記録する */
function noteDiscard(git: GitDir, before: string | undefined, after: string | undefined): boolean {
  if (before === undefined || before === after) return false
  return !has(git.objects, hashBlob(before))
}

function matchAll(specs: string[], candidates: FilePath[]): Map<string, FilePath[]> {
  const hits = new Map<string, FilePath[]>()
  for (const spec of specs) {
    const match = pathspecMatcher(spec)
    hits.set(
      spec,
      candidates.filter((p) => match(p)),
    )
  }
  return hits
}

const isWholeTree = (specs: string[]) => specs.some((s) => s === '.' || s === './' || s === ':/')

function treeOf(cmd: Cmd, git: GitDir, spec: string): { oid: Oid; tree: FlatTree } {
  const oid = resolveRevision(git, spec)
  if (!oid) fail(cmd, `fatal: could not resolve ${spec}`)
  return { oid, tree: commitTree(git, oid) }
}

const sameEntry = (a: IndexEntry | undefined, b: IndexEntry | undefined) =>
  a?.oid === b?.oid && a?.mode === b?.mode

export function restore(cmd: Cmd, argv: string[]): void {
  const parsed = parseArgs(argv, [
    { name: 'source', short: 's', long: ['source'], value: true },
    { name: 'staged', short: 'S', long: ['staged'] },
    { name: 'worktree', short: 'W', long: ['worktree'] },
    { name: 'ours', long: ['ours'] },
    { name: 'theirs', long: ['theirs'] },
    { name: 'merge', short: 'm', long: ['merge'] },
  ])
  if (!parsed.ok) fail(cmd, parsed.error, 129)
  const { flags, values, positionals } = parsed.args
  const git = requireWorktree(cmd)
  if (flags.has('merge')) unsupported(cmd, 'git restore --merge（コンフリクトの印を作り直す）')
  if (positionals.length === 0) fail(cmd, 'fatal: you must specify path(s) to restore')

  const staged = flags.has('staged')
  const worktree = flags.has('worktree') || !staged
  const side = flags.has('ours') ? 'ours' : flags.has('theirs') ? 'theirs' : null
  if (side && staged)
    fail(cmd, "fatal: options '--staged' and '--ours/--theirs' cannot be used together")

  // 元にするもの：--source があればそのコミット。なければ、ステージを戻すときは HEAD、作業ツリーだけなら index
  const sourceSpec = values.get('source')?.[0] ?? (staged ? 'HEAD' : null)
  const source = sourceSpec === null ? null : treeOf(cmd, git, sourceSpec)

  const candidates = [
    ...new Set([
      ...Object.keys(git.index),
      ...Object.keys(git.unmerged),
      ...(source ? Object.keys(source.tree) : []),
    ]),
  ].sort()
  const hits = matchAll(positionals, candidates)
  for (const [spec, paths] of hits) {
    if (paths.length === 0) {
      fail(cmd, `error: pathspec '${spec}' did not match any file(s) known to git`, 1)
    }
  }
  const paths = [...new Set([...hits.values()].flat())].sort()

  // コンフリクト中のファイルは、作業ツリーだけを戻すなら --ours / --theirs が要る
  if (worktree && !staged && source === null && !side) {
    const unmerged = paths.filter((p) => has(git.unmerged, p))
    if (unmerged.length > 0) {
      for (const p of unmerged) cmd.err.push(`error: path '${p}' is unmerged`)
      abort(1)
    }
  }

  const discarded: FilePath[] = []
  const unstaged: FilePath[] = []
  for (const path of paths) {
    let from: IndexEntry | undefined
    if (side) {
      const stage = own(git.unmerged, path)?.[side]
      if (!has(git.unmerged, path)) {
        from = own(git.index, path)
      } else if (!stage) {
        cmd.err.push(
          `error: path '${path}' does not have ${side === 'ours' ? 'our' : 'their'} version`,
        )
        abort(1)
      } else from = stage
    } else if (source) {
      from = own(source.tree, path)
    } else {
      from = own(git.index, path)
    }

    if (staged) {
      const before = own(git.index, path)
      if (!sameEntry(before, from) || has(git.unmerged, path)) unstaged.push(path)
      delete git.unmerged[path]
      if (from) git.index[path] = { ...from }
      else delete git.index[path]
    }
    if (worktree) {
      const before = own(cmd.ws.files, path)
      const after = from ? readBlob(git, from.oid).content : undefined
      if (noteDiscard(git, before, after)) discarded.push(path)
      if (after !== undefined) cmd.ws.files[path] = after
      else delete cmd.ws.files[path]
    }
  }
  if (unstaged.length > 0) cmd.events.push({ type: 'FILES_UNSTAGED', paths: unstaged })
  if (discarded.length > 0) {
    cmd.events.push({ type: 'CHANGES_DISCARDED', paths: discarded, bulk: isWholeTree(positionals) })
  }
}

/**
 * git checkout [<commit>] [--] <file>...：ファイルを index（またはコミット）の内容に戻す。
 * コミットを指定したときは index も書き換える。元にないファイルは消さない
 */
export function checkoutPaths(
  cmd: Cmd,
  git: GitDir,
  treeish: string | null,
  specs: string[],
  side: 'ours' | 'theirs' | null,
  /** -- を付けなかったとき、本物の git は戻したファイルの数を知らせる */
  announce: boolean,
): void {
  const source = treeish === null ? null : treeOf(cmd, git, treeish)
  const candidates = [
    ...new Set([
      ...Object.keys(git.index),
      ...Object.keys(git.unmerged),
      ...(source ? Object.keys(source.tree) : []),
    ]),
  ].sort()
  const hits = matchAll(specs, candidates)
  for (const [spec, paths] of hits) {
    if (paths.length === 0) {
      fail(cmd, `error: pathspec '${spec}' did not match any file(s) known to git`, 1)
    }
  }
  let paths = [...new Set([...hits.values()].flat())].sort()
  if (source) paths = paths.filter((p) => has(source.tree, p))

  if (!source && !side) {
    const unmerged = paths.filter((p) => has(git.unmerged, p))
    if (unmerged.length > 0) {
      for (const p of unmerged) cmd.err.push(`error: path '${p}' is unmerged`)
      abort(1)
    }
  }
  if (side) {
    const missing = paths.filter((p) => has(git.unmerged, p) && !own(git.unmerged, p)?.[side])
    if (missing.length > 0) {
      for (const p of missing) {
        cmd.err.push(
          `error: path '${p}' does not have ${side === 'ours' ? 'our' : 'their'} version`,
        )
      }
      abort(1)
    }
  }

  const discarded: FilePath[] = []
  let written = 0
  for (const path of paths) {
    let from: IndexEntry | undefined
    if (source) {
      from = own(source.tree, path)
      if (from) {
        delete git.unmerged[path]
        git.index[path] = { ...from }
      }
    } else if (side && has(git.unmerged, path)) {
      from = own(git.unmerged, path)?.[side]
    } else {
      from = own(git.index, path)
    }
    if (!from) continue
    const after = readBlob(git, from.oid).content
    const before = own(cmd.ws.files, path)
    if (noteDiscard(git, before, after)) discarded.push(path)
    // 中身が同じファイルは書き直さない（数にも入らない）
    if (before !== after) written++
    cmd.ws.files[path] = after
  }

  const n = written
  if (announce) {
    const noun = n === 1 ? 'path' : 'paths'
    // コミットから戻したときは、コミットではなくその tree の短縮ハッシュを出す（本物の git と同じ）
    const from = source ? abbrev(git, readCommit(git, source.oid).tree) : 'the index'
    cmd.err.push(`Updated ${n} ${noun} from ${from}`)
  }
  if (discarded.length > 0) {
    cmd.events.push({ type: 'CHANGES_DISCARDED', paths: discarded, bulk: isWholeTree(specs) })
  }
}
