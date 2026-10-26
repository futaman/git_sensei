import { writeObject } from '../objects/store.ts'
import { parseArgs } from '../parser/options.ts'
import { pathspecMatcher } from '../worktree/pathspec.ts'
import { type Cmd, fail, requireWorktree } from './context.ts'

export function add(cmd: Cmd, argv: string[]): void {
  const parsed = parseArgs(argv, [
    { name: 'all', short: 'A', long: ['all'] },
    { name: 'update', short: 'u', long: ['update'] },
  ])
  if (!parsed.ok) fail(cmd, parsed.error, 129)
  const { flags, positionals } = parsed.args
  const git = requireWorktree(cmd)
  const all = flags.has('all')
  const update = flags.has('update')
  if (all && update) fail(cmd, "fatal: options '-A' and '-u' cannot be used together")

  if (positionals.length === 0 && !all && !update) {
    cmd.err.push(
      'Nothing specified, nothing added.',
      "hint: Maybe you wanted to say 'git add .'?",
      'hint: Turn this message off by running',
      'hint: "git config advice.addEmptyPathspec false"',
    )
    return
  }

  const specs = positionals.length > 0 ? positionals : ['.']
  const candidates = [
    ...new Set([
      ...Object.keys(cmd.ws.files),
      ...Object.keys(git.index),
      ...Object.keys(git.unmerged),
    ]),
  ]
    .filter((p) => !update || p in git.index || p in git.unmerged)
    .sort()

  const matched = new Set<string>()
  for (const spec of specs) {
    const match = pathspecMatcher(spec)
    const hits = candidates.filter(match)
    if (hits.length === 0) fail(cmd, `fatal: pathspec '${spec}' did not match any files`)
    for (const p of hits) matched.add(p)
  }

  const staged: string[] = []
  for (const path of [...matched].sort()) {
    const content = cmd.ws.files[path]
    const conflict = git.unmerged[path]
    if (conflict) {
      // add すると、コンフリクトを解消したことになる（stage 1〜3 を消して stage 0 にする）
      delete git.unmerged[path]
      if (content !== undefined) {
        const mode = (conflict.ours ?? conflict.theirs ?? conflict.base)?.mode ?? '100644'
        git.index[path] = { oid: writeObject(git, { type: 'blob', content }), mode }
      }
      staged.push(path)
      cmd.events.push({
        type: 'CONFLICT_RESOLVED',
        path,
        remaining: Object.keys(git.unmerged).length,
      })
      continue
    }
    const before = git.index[path]
    if (content === undefined) {
      if (before) {
        delete git.index[path]
        staged.push(path)
      }
      continue
    }
    const oid = writeObject(git, { type: 'blob', content })
    if (before?.oid === oid) continue
    git.index[path] = { oid, mode: before?.mode ?? '100644' }
    staged.push(path)
  }
  if (staged.length > 0) cmd.events.push({ type: 'FILES_STAGED', paths: staged })
}
