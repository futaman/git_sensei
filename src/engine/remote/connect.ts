// リモート名や URL から、相手のリポジトリ（同じ world の中の別ワークスペース）を開く。
import type { Cmd } from '../commands/context.ts'
import { fail } from '../commands/context.ts'
import { findWorkspace, resolvePath } from '../model/paths.ts'
import type { GitDir, Workspace } from '../model/types.ts'

export interface OpenedRemote {
  /** 設定されたリモート名（URL を直接指定したときは null） */
  name: string | null
  url: string
  ws: Workspace
  git: GitDir
}

function notARepository(cmd: Cmd, what: string): never {
  return fail(
    cmd,
    [
      `fatal: '${what}' does not appear to be a git repository`,
      'fatal: Could not read from remote repository.',
      '',
      'Please make sure you have the correct access rights',
      'and the repository exists.',
    ].join('\n'),
  )
}

/** リモート名（origin）または URL（パス）から相手のリポジトリを開く */
export function openRemote(cmd: Cmd, git: GitDir, nameOrUrl: string): OpenedRemote {
  const configured = git.config[`remote.${nameOrUrl}.url`]
  const url = configured ?? nameOrUrl
  if (!configured && !url.includes('/')) notARepository(cmd, nameOrUrl)
  const hit = findWorkspace(cmd.world, resolvePath(cmd.ws.path, url))
  if (!hit?.[1].git) notARepository(cmd, url)
  return { name: configured ? nameOrUrl : null, url, ws: hit[1], git: hit[1].git }
}

/** fetch / pull / push で、リモート名を省略したときの既定（上流のリモート → origin） */
export function defaultRemote(git: GitDir, branch: string | null): string | null {
  const fromUpstream = branch ? git.config[`branch.${branch}.remote`] : undefined
  if (fromUpstream) return fromUpstream
  return git.config['remote.origin.url'] ? 'origin' : null
}
