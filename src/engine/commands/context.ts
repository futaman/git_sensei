// 各コマンドの実装が共通で使う型と道具。
import type { GitEvent } from '../events.ts'
import { own } from '../model/dict.ts'
import type { ExecContext, GitDir, Workspace, World } from '../model/types.ts'

export interface CommandResult {
  stdout: string
  stderr: string
  exitCode: number
  events: GitEvent[]
  /** シミュレータが対応していない操作だった（本物のgitのエラーではない） */
  unsupported?: boolean
  /** cd で移動したときの、新しいワークスペースのキー */
  cwd?: string
}

/** コマンドの実行中に使う状態。world は Immer の draft なので直接書き換えてよい */
export interface Cmd {
  world: World
  ws: Workspace
  ctx: ExecContext
  out: string[]
  err: string[]
  events: GitEvent[]
  /** cd の移動先（ワークスペースのキー） */
  cwd?: string
}

/** 終了コードを持って throw する。rollback なら、それまでの変更を捨てる */
export class Exit {
  readonly code: number
  readonly rollback: boolean
  readonly unsupported: boolean

  constructor(code: number, rollback: boolean, unsupported = false) {
    this.code = code
    this.rollback = rollback
    this.unsupported = unsupported
  }
}

export function fail(cmd: Cmd, message: string, code = 128): never {
  cmd.err.push(message)
  throw new Exit(code, true)
}

/** エラー文は出力済みのとき。変更を捨てて終える */
export function abort(code: number): never {
  throw new Exit(code, true)
}

/** 変更を残したまま、0以外の終了コードで終える（commit で何もなかったときなど） */
export function exitKeep(code: number): never {
  throw new Exit(code, false)
}

export function unsupported(cmd: Cmd, what: string): never {
  cmd.err.push(`git-sensei: ${what} はこのシミュレータではまだ使えません`)
  throw new Exit(1, true, true)
}

export function requireRepo(cmd: Cmd): GitDir {
  if (!cmd.ws.git) fail(cmd, 'fatal: not a git repository (or any of the parent directories): .git')
  return cmd.ws.git
}

/** 作業ツリーが必要なコマンド（add, commit, status など）。bare リポジトリでは使えない */
export function requireWorktree(cmd: Cmd): GitDir {
  const git = requireRepo(cmd)
  if (git.bare) fail(cmd, 'fatal: this operation must be run in a work tree')
  return git
}

export function configValue(cmd: Cmd, key: string): string | undefined {
  return (cmd.ws.git ? own(cmd.ws.git.config, key) : undefined) ?? own(cmd.world.globalConfig, key)
}
