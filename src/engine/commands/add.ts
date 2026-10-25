import { writeObject } from '../objects/store.ts'
import { parseArgs } from '../parser/options.ts'
import { pathspecMatcher } from '../worktree/pathspec.ts'
import { type Cmd, fail, requireRepo } from './context.ts'

export function add(cmd: Cmd, argv: string[]): void {
  const parsed = parseArgs(argv, [
    { name: 'all', short: 'A', long: ['all'] },
    { name: 'update', short: 'u', long: ['update'] },
  ])
  if (!parsed.ok) fail(cmd, parsed.error, 129)
  const { flags, positionals } = parsed.args
  const git = requireRepo(cmd)
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
  const candidates = [...new Set([...Object.keys(cmd.ws.files), ...Object.keys(git.index)])]
    .filter((p) => !update || p in git.index)
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
