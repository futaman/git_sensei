// NPC（同僚）の台本を実行する。NPC もプレイヤーと同じエンジンで、自分のクローンにコマンドを打つ。
import {
  type CommandResult,
  deleteFile,
  type ExecContext,
  execute,
  type GitEvent,
  type World,
  writeFile,
} from '../engine/index.ts'

export interface Actor {
  /** 画面に出す名前（例 後輩 田中） */
  name: string
  /** 作業するワークスペースのキー */
  workspace: string
}

export type NpcAction =
  | { actor: string; run: string }
  | { actor: string; write: [path: string, content: string] }
  | { actor: string; remove: string }

/** 台本のひとまとまり（「後輩が README を更新して push する」など） */
export interface NpcBeat {
  id: string
  title: string
  actions: NpcAction[]
}

export interface NpcStepLog {
  actor: string
  command: string
  result: CommandResult
}

export interface BeatResult {
  world: World
  log: NpcStepLog[]
  events: { actor: string; event: GitEvent; command: string }[]
  /** 途中のコマンドが失敗した（プレイヤーの操作で状況が変わったなど） */
  failed: NpcStepLog | null
}

/**
 * 台本を1まとまり実行する。時刻はコマンドごとに1秒ずつ進める（グラフの並びを安定させるため）。
 * 失敗したコマンドがあれば、そこで止める
 */
export function runBeat(
  world: World,
  beat: NpcBeat,
  actors: Record<string, Actor>,
  now: ExecContext['now'],
): BeatResult {
  let w = world
  let clock = now.timestamp
  const log: NpcStepLog[] = []
  const events: BeatResult['events'] = []
  for (const action of beat.actions) {
    const actor = actors[action.actor]
    if (!actor) throw new Error(`台本に知らない登場人物がいます：${action.actor}`)
    if ('write' in action) {
      w = writeFile(w, actor.workspace, ...action.write)
      continue
    }
    if ('remove' in action) {
      w = deleteFile(w, actor.workspace, action.remove)
      continue
    }
    const result = execute(w, action.run, {
      workspace: actor.workspace,
      now: { timestamp: clock++, tzOffset: now.tzOffset },
      tty: false,
    })
    w = result.world
    const step = { actor: actor.name, command: action.run, result }
    log.push(step)
    for (const event of result.events)
      events.push({ actor: actor.name, event, command: action.run })
    if (result.exitCode !== 0) return { world: w, log, events, failed: step }
  }
  return { world: w, log, events, failed: null }
}
