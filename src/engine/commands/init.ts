import { own } from '../model/dict.ts'
import { emptyGitDir } from '../model/paths.ts'
import { parseArgs } from '../parser/options.ts'
import { isValidBranchName } from '../refs.ts'
import { type Cmd, fail } from './context.ts'

export function init(cmd: Cmd, argv: string[]): void {
  const parsed = parseArgs(argv, [
    { name: 'branch', short: 'b', long: ['initial-branch'], value: true },
    { name: 'quiet', short: 'q', long: ['quiet'] },
    { name: 'bare', long: ['bare'] },
  ])
  if (!parsed.ok) fail(cmd, parsed.error, 129)
  const { args } = parsed
  if (args.positionals.length > 0)
    fail(cmd, 'git-sensei: git init のディレクトリ指定には未対応です', 1)

  const bare = args.flags.has('bare') || (cmd.ws.git?.bare ?? false)
  const gitPath = bare ? `${cmd.ws.path}/` : `${cmd.ws.path}/.git/`
  if (cmd.ws.git) {
    if (!args.flags.has('quiet'))
      cmd.out.push(`Reinitialized existing Git repository in ${gitPath}`)
    cmd.events.push({ type: 'REPO_INITIALIZED', reinitialized: true })
    return
  }

  const branch =
    args.values.get('branch')?.[0] ?? own(cmd.world.globalConfig, 'init.defaultBranch') ?? 'main'
  if (!isValidBranchName(branch)) fail(cmd, `fatal: invalid initial branch name: '${branch}'`)

  cmd.ws.git = emptyGitDir(branch, bare)
  if (!args.flags.has('quiet')) cmd.out.push(`Initialized empty Git repository in ${gitPath}`)
  cmd.events.push({ type: 'REPO_INITIALIZED', reinitialized: false })
}
