// ① gitシミュレータ（docs/02）
// どの層にも依存しない純粋TS。DOM・React・Date.now()・Math.random() は使わない。
// 時刻や乱数のシードは呼び出し側から ctx で受け取る。
import { produce } from 'immer'
import { add } from './commands/add.ts'
import { branch } from './commands/branch.ts'
import { clone } from './commands/clone.ts'
import { commit } from './commands/commit.ts'
import { config } from './commands/config.ts'
import { type Cmd, type CommandResult, Exit, unsupported } from './commands/context.ts'
import { fetch } from './commands/fetch.ts'
import { init } from './commands/init.ts'
import { log } from './commands/log.ts'
import { merge } from './commands/merge.ts'
import { pull } from './commands/pull.ts'
import { push } from './commands/push.ts'
import { remote } from './commands/remote.ts'
import { shell } from './commands/shell.ts'
import { status } from './commands/status.ts'
import { checkoutCmd, switchCmd } from './commands/switch.ts'
import type { GitEvent } from './events.ts'
import { copyDict, dict, own } from './model/dict.ts'
import { findWorkspace, resolvePath } from './model/paths.ts'
import type { ExecContext, FilePath, GitDir, Workspace, World } from './model/types.ts'
import { tokenize } from './parser/tokenize.ts'

export type { CommandResult } from './commands/context.ts'
export type { GitEvent, PushRejectReason, RefUpdate } from './events.ts'
export { has, own } from './model/dict.ts'
export { findWorkspace, resolvePath } from './model/paths.ts'
export type * from './model/types.ts'
export * from './query.ts'

const GIT_COMMANDS: Record<string, (cmd: Cmd, argv: string[]) => void> = {
  init,
  add,
  commit,
  status,
  log,
  branch,
  switch: switchCmd,
  checkout: checkoutCmd,
  merge,
  config,
  remote,
  clone,
  fetch,
  pull,
  push,
}

/** 本物のgitにはあるが、まだ実装していないサブコマンド（docs/05 §3） */
const PLANNED = new Set([
  'rm',
  'mv',
  'diff',
  'show',
  'restore',
  'reset',
  'revert',
  'reflog',
  'stash',
  'rebase',
  'cherry-pick',
  'tag',
])

export interface ExecuteResult extends CommandResult {
  world: World
}

export function createWorld(
  workspaces: Record<string, { path: string; files?: Record<FilePath, string> }>,
  globalConfig: Record<string, string> = {},
): World {
  return {
    workspaces: dict(
      Object.entries(workspaces).map(([id, w]) => [
        id,
        { path: w.path, files: copyDict(w.files ?? {}), git: null },
      ]),
    ),
    globalConfig: copyDict(globalConfig),
  }
}

/**
 * JSON から読み込んだ world を、エンジンが扱える形に戻す。
 * 名前をキーにする表をすべてプロトタイプなしの表にする（'__proto__' という名前のファイルなどのため）
 */
export function reviveWorld(saved: World): World {
  const reviveGit = (git: GitDir): GitDir => ({
    ...git,
    objects: copyDict(git.objects),
    refs: copyDict(git.refs),
    symrefs: copyDict(git.symrefs),
    index: copyDict(git.index),
    unmerged: copyDict(git.unmerged),
    config: copyDict(git.config),
  })
  const reviveWorkspace = (ws: Workspace): Workspace => ({
    path: ws.path,
    files: copyDict(ws.files),
    git: ws.git ? reviveGit(ws.git) : null,
  })
  return {
    workspaces: dict(Object.entries(saved.workspaces).map(([id, ws]) => [id, reviveWorkspace(ws)])),
    globalConfig: copyDict(saved.globalConfig),
  }
}

/** エディタでの編集に相当する。ファイルの作成と上書き */
export function writeFile(world: World, workspace: string, path: FilePath, content: string): World {
  return produce(world, (draft) => {
    const ws = own(draft.workspaces, workspace)
    if (!ws) throw new Error(`ワークスペース ${workspace} がありません`)
    ws.files[path] = content
  })
}

/** 空のディレクトリを作る（mkdir 相当）。キーはパスそのもの */
export function addWorkspace(world: World, path: string): World {
  const abs = resolvePath('/', path)
  if (findWorkspace(world, abs)) return world
  return produce(world, (draft) => {
    draft.workspaces[abs] = { path: abs, files: dict(), git: null }
  })
}

export function deleteFile(world: World, workspace: string, path: FilePath): World {
  return produce(world, (draft) => {
    const ws = own(draft.workspaces, workspace)
    if (!ws) throw new Error(`ワークスペース ${workspace} がありません`)
    delete ws.files[path]
  })
}

/** 1行のコマンドを実行する。world は書き換えず、新しい world を返す */
export function execute(world: World, input: string, ctx: ExecContext): ExecuteResult {
  const out: string[] = []
  const err: string[] = []
  const events: GitEvent[] = []
  let exitCode = 0
  let isUnsupported = false
  let cwd: string | undefined
  let next = world

  const tokens = tokenize(input)
  if (!tokens.ok) return finish(world, [], [`git-sensei: ${tokens.error}`], 2, [], false)
  if (tokens.argv.length === 0) return finish(world, [], [], 0, [], false)

  try {
    next = produce(world, (draft) => {
      const ws = own(draft.workspaces, ctx.workspace)
      if (!ws) throw new Error(`ワークスペース ${ctx.workspace} がありません`)
      const cmd: Cmd = { world: draft, ws, ctx, out, err, events }
      try {
        run(cmd, tokens.argv)
        cwd = cmd.cwd
      } catch (e) {
        if (e instanceof Exit && !e.rollback) {
          exitCode = e.code
          return
        }
        throw e
      }
    })
  } catch (e) {
    if (!(e instanceof Exit)) throw e
    exitCode = e.code
    isUnsupported = e.unsupported
    events.length = 0
  }
  const result = finish(next, out, err, exitCode, events, isUnsupported)
  return cwd !== undefined && cwd !== ctx.workspace ? { ...result, cwd } : result
}

function run(cmd: Cmd, argv: string[]): void {
  const [program, sub, ...rest] = argv
  if (program !== 'git') {
    if (shell(cmd, program as string, argv.slice(1))) return
    unsupported(cmd, `'${program}' コマンド`)
  }
  if (sub === undefined) {
    cmd.err.push('usage: git <command> [<args>]')
    throw new Exit(1, true)
  }
  const handler = own(GIT_COMMANDS, sub)
  if (handler) {
    handler(cmd, rest)
    return
  }
  if (PLANNED.has(sub)) unsupported(cmd, `git ${sub}`)
  cmd.err.push(`git: '${sub}' is not a git command. See 'git --help'.`)
  throw new Exit(1, true)
}

function finish(
  world: World,
  out: string[],
  err: string[],
  exitCode: number,
  events: GitEvent[],
  isUnsupported: boolean,
): ExecuteResult {
  const text = (lines: string[]) => (lines.length > 0 ? `${lines.join('\n')}\n` : '')
  return {
    world,
    stdout: text(out),
    stderr: text(err),
    exitCode,
    events,
    ...(isUnsupported ? { unsupported: true } : {}),
  }
}
