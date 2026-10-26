// git rm（ファイルを消して、その削除をステージする）と git mv（名前を変えて、ステージする）。
import { has, own } from '../model/dict.ts'
import type { FilePath } from '../model/types.ts'
import { hashBlob } from '../objects/serialize.ts'
import { commitTree } from '../objects/store.ts'
import { parseArgs } from '../parser/options.ts'
import { headOid } from '../refs.ts'
import { pathspecMatcher } from '../worktree/pathspec.ts'
import { abort, type Cmd, fail, requireWorktree, unsupported } from './context.ts'

export function rm(cmd: Cmd, argv: string[]): void {
  const parsed = parseArgs(argv, [
    { name: 'cached', long: ['cached'] },
    { name: 'recursive', short: 'r' },
    { name: 'force', short: 'f', long: ['force'] },
    { name: 'quiet', short: 'q', long: ['quiet'] },
  ])
  if (!parsed.ok) fail(cmd, parsed.error, 129)
  const { flags, positionals } = parsed.args
  const git = requireWorktree(cmd)
  if (positionals.length === 0) {
    fail(cmd, 'usage: git rm [-f | --force] [-n] [-q] [--cached] [-r] [--] <pathspec>...', 129)
  }
  const cached = flags.has('cached')
  const tracked = [...new Set([...Object.keys(git.index), ...Object.keys(git.unmerged)])].sort()

  const targets = new Set<FilePath>()
  for (const spec of positionals) {
    const match = pathspecMatcher(spec)
    const hits = tracked.filter(match)
    if (hits.length === 0) fail(cmd, `fatal: pathspec '${spec}' did not match any files`)
    // ディレクトリをまるごと消すには -r が要る
    const literal = spec.replace(/^\.\/+/, '').replace(/\/+$/, '')
    if (!flags.has('recursive') && !hits.includes(literal) && !/[*?[]/.test(spec)) {
      fail(cmd, `fatal: not removing '${literal}' recursively without -r`)
    }
    for (const p of hits) targets.add(p)
  }

  // 消すと取り返せない変更があれば止める（-f で強制）
  if (!flags.has('force')) {
    const head = commitTree(git, headOid(git))
    const both: FilePath[] = []
    const staged: FilePath[] = []
    const local: FilePath[] = []
    for (const path of [...targets].sort()) {
      const i = own(git.index, path)
      if (!i) continue
      const h = own(head, path)
      const w = own(cmd.ws.files, path)
      const worktreeChanged = w !== undefined && hashBlob(w) !== i.oid
      const indexChanged = h?.oid !== i.oid
      if (indexChanged && worktreeChanged) both.push(path)
      else if (indexChanged && h && !cached) staged.push(path)
      else if (worktreeChanged && !cached) local.push(path)
    }
    const report = (singular: string, plural: string, paths: FilePath[], hint: string) => {
      if (paths.length === 0) return
      cmd.err.push(
        `error: the following ${paths.length === 1 ? singular : plural}`,
        ...paths.map((p) => `    ${p}`),
        hint,
      )
    }
    report(
      'file has staged content different from both the\nfile and the HEAD:',
      'files have staged content different from both the\nfile and the HEAD:',
      both,
      '(use -f to force removal)',
    )
    report(
      'file has changes staged in the index:',
      'files have changes staged in the index:',
      staged,
      '(use --cached to keep the file, or -f to force removal)',
    )
    report(
      'file has local modifications:',
      'files have local modifications:',
      local,
      '(use --cached to keep the file, or -f to force removal)',
    )
    if (both.length + staged.length + local.length > 0) abort(1)
  }

  const removed = [...targets].sort()
  for (const path of removed) {
    delete git.index[path]
    delete git.unmerged[path]
    if (!cached) delete cmd.ws.files[path]
    if (!flags.has('quiet')) cmd.out.push(`rm '${path}'`)
  }
  cmd.events.push({ type: 'FILES_REMOVED', paths: removed, cached })
}

export function mv(cmd: Cmd, argv: string[]): void {
  const parsed = parseArgs(argv, [{ name: 'force', short: 'f', long: ['force'] }])
  if (!parsed.ok) fail(cmd, parsed.error, 129)
  const { flags, positionals } = parsed.args
  const git = requireWorktree(cmd)
  if (positionals.length !== 2) {
    if (positionals.length > 2) unsupported(cmd, '複数のファイルをまとめて動かす git mv')
    fail(cmd, 'usage: git mv [<options>] <source>... <destination>', 129)
  }
  const strip = (p: string) => p.replace(/^\.\/+/, '').replace(/\/+$/, '')
  const src = strip(positionals[0] as string)
  let dst = strip(positionals[1] as string)
  const isDir = (p: string) => Object.keys(cmd.ws.files).some((f) => f.startsWith(`${p}/`))

  if (isDir(src)) unsupported(cmd, 'フォルダごとの git mv')
  if (!has(cmd.ws.files, src)) fail(cmd, `fatal: bad source, source=${src}, destination=${dst}`)
  if (!has(git.index, src)) {
    fail(cmd, `fatal: not under version control, source=${src}, destination=${dst}`)
  }
  if (dst === '' || isDir(dst))
    dst = dst === '' ? (src.split('/').pop() as string) : `${dst}/${src.split('/').pop()}`
  if (has(cmd.ws.files, dst) && !flags.has('force')) {
    fail(cmd, `fatal: destination exists, source=${src}, destination=${dst}`)
  }

  cmd.ws.files[dst] = cmd.ws.files[src] as string
  delete cmd.ws.files[src]
  git.index[dst] = { ...(git.index[src] as { oid: string; mode: '100644' | '100755' }) }
  delete git.index[src]
  cmd.events.push({ type: 'FILE_MOVED', from: src, to: dst })
}
