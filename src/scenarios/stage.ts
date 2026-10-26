// ステージ（シナリオ1本）の進行。エンジンでコマンドを実行し、シナリオの判定と演出エンジンをつなぐ。
// 画面に依存しない（時刻は呼び出し側から受け取る）ので、解答手順をそのままテストできる。
import {
  type Character,
  type Cue,
  type DangerKind,
  type DramaInput,
  type DramaSettings,
  type DramaState,
  initDrama,
  isObservation,
  stepDrama,
} from '../drama/index.ts'
import {
  type ExecContext,
  type ExecuteResult,
  execute,
  stateHash,
  type World,
  writeFile,
} from '../engine/index.ts'
import type { DangerPolicy } from './dangers.ts'
import { commandInput } from './dramaInput.ts'

export interface StageNote {
  from: Character
  key: string
  trust?: number
  mood?: number
}

/** シナリオが判定して返すもの（コマンド1回ごと） */
export interface StageEvaluation {
  /** 新たに満たしたマイルストーン */
  milestones: string[]
  /** 場面に応じたセリフ（間違った解消への反応など） */
  notes: StageNote[]
  /** ゴールを満たした */
  cleared: boolean
  /** クリアしたときの結末の出し分け（演出エンジンの finish にそのまま渡す） */
  ending?: Pick<Extract<DramaInput, { type: 'finish' }>, 'replace' | 'epilogue'>
}

/** シナリオが覚えておく進み具合（マイルストーン、言ったセリフ、拒否されたか など） */
export interface StageProgress {
  milestones: string[]
  said: string[]
  flags: string[]
}

export interface Chip {
  command: string
  cursorBack?: number
}

export interface ReportText {
  title: string
  what: string
  why: string
  howToFix: string
  prevention: string
  bossWord: string
}

/** 画面に出すゴールの1行 */
export interface StageGoal {
  text: string
  done: boolean
}

export interface StageDefinition {
  id: string
  title: string
  /** 「今日のしごと」カード */
  mission: { task: string; due: string }
  /** いまの状況の説明（導入で見せる）。何がすでに終わっていて、何が残っているか */
  situation: string[]
  /** 導入のチャット（3つ以内） */
  intro: { from: Character; text: string }[]
  home: string
  /** プレイヤーが作業するワークスペースのキー */
  workspace: string
  buildWorld(now: ExecContext['now']): World
  drama: Omit<DramaSettings, 'untimed'>
  policy: DangerPolicy
  /** 致命的な危険のあと、その直前に戻れるようにする（実戦型） */
  checkpointOnFatal: boolean
  evaluate(
    before: World,
    result: ExecuteResult,
    command: string,
    progress: StageProgress,
  ): StageEvaluation
  chips(world: World, progress: StageProgress): Chip[]
  /** ゴールの一覧と、いまの world で達成しているか（すべて達成でクリア） */
  goals(world: World): StageGoal[]
  /** ヒントを見たときに先輩が言うセリフの key（いまの進み具合に合わせる） */
  hint(world: World, progress: StageProgress): string
  /** 手が止まったときに先輩が言うセリフの key（間違えた後など）。なければ senpai.idle を段階的に */
  helper?(world: World, progress: StageProgress): string | undefined
  /** ヒント1回で飛ぶ作中の秒。なければ DEFAULT_DURATION_SEC.hint */
  hintSec?: number
  /** コマンドの所要時間（作中の秒、docs/06 の 2.2）。なければ DEFAULT_DURATION_SEC で決める */
  durationOf?(command: string, result: ExecuteResult): number | undefined
  reports: Partial<Record<DangerKind, ReportText>>
  /** 登場人物の表示名 */
  names: Record<Character, string>
}

export interface StageSession {
  world: World
  cwd: string
  drama: DramaState
  progress: StageProgress
  /** 致命的な危険の直前の world。戻れるあいだだけある */
  checkpoint: World | null
  cleared: boolean
}

export interface StageStep {
  session: StageSession
  cues: Cue[]
  result: ExecuteResult | null
}

/** 作中の所要時間の目安（docs/04_spec_scenarios の 2.4） */
export const DEFAULT_DURATION_SEC = { observe: 0, normal: 60, error: 120, hint: 300 }

export function durationOf(def: StageDefinition, command: string, result: ExecuteResult): number {
  const custom = def.durationOf?.(command, result)
  if (custom !== undefined) return custom
  if (command.trim() === '' || isObservation(command)) return DEFAULT_DURATION_SEC.observe
  return result.exitCode === 0 ? DEFAULT_DURATION_SEC.normal : DEFAULT_DURATION_SEC.error
}

const FATAL: DangerKind[] = [
  'FORCE_PUSH_OVERWROTE',
  'SECRET_PUSHED',
  'UNCOMMITTED_CHANGES_DISCARDED',
]

export function startStage(
  def: StageDefinition,
  now: ExecContext['now'],
  untimed: boolean,
): StageStep {
  const world = def.buildWorld(now)
  const { state, cues } = initDrama({ ...def.drama, untimed }, stateHash(world))
  return {
    session: {
      world,
      cwd: def.workspace,
      drama: state,
      progress: { milestones: [], said: [], flags: [] },
      checkpoint: null,
      cleared: false,
    },
    cues,
    result: null,
  }
}

function drive(
  def: StageDefinition,
  session: StageSession,
  untimed: boolean,
  inputs: DramaInput[],
): { drama: DramaState; cues: Cue[] } {
  const settings: DramaSettings = { ...def.drama, untimed }
  let drama = session.drama
  const cues: Cue[] = []
  for (const input of inputs) {
    const r = stepDrama(drama, input, settings)
    drama = r.state
    cues.push(...r.cues)
  }
  return { drama, cues }
}

/** ターミナルに1行打った */
export function stageCommand(
  def: StageDefinition,
  session: StageSession,
  command: string,
  at: number,
  now: ExecContext['now'],
  untimed: boolean,
): StageStep {
  if (session.cleared) return { session, cues: [], result: null }
  const before = session.world
  const result = execute(before, command, {
    workspace: session.cwd,
    now,
    tty: true,
    home: def.home,
  })
  const progress: StageProgress = {
    milestones: [...session.progress.milestones],
    said: [...session.progress.said],
    flags: [...session.progress.flags],
  }
  const evaluation = def.evaluate(before, result, command, progress)
  progress.milestones.push(...evaluation.milestones)

  const input: DramaInput = {
    ...commandInput({
      command,
      workspace: session.cwd,
      result,
      at,
      milestones: evaluation.milestones,
      policy: def.policy,
    }),
    durationSec: durationOf(def, command, result),
  }
  const inputs: DramaInput[] = [input]
  for (const n of evaluation.notes) {
    if (progress.said.includes(n.key)) continue
    progress.said.push(n.key)
    inputs.push({ type: 'note', at, ...n })
  }
  if (evaluation.cleared) inputs.push({ type: 'finish', at, ...evaluation.ending })
  const { drama, cues } = drive(def, session, untimed, inputs)

  const fatal =
    input.type === 'command' && input.dangers.some((d) => !d.allowed && FATAL.includes(d.kind))
  return {
    session: {
      world: result.world,
      cwd: result.cwd ?? session.cwd,
      drama,
      progress,
      checkpoint: def.checkpointOnFatal && fatal ? before : session.checkpoint,
      cleared: evaluation.cleared,
    },
    cues,
    result,
  }
}

/** 時間の経過（画面が1秒ごとに呼ぶ） */
export function stageTick(
  def: StageDefinition,
  session: StageSession,
  at: number,
  untimed: boolean,
): StageStep {
  if (session.cleared) return { session, cues: [], result: null }
  const helperKey = def.helper?.(session.world, session.progress)
  const { drama, cues } = drive(def, session, untimed, [{ type: 'tick', at, helperKey }])
  return { session: { ...session, drama }, cues, result: null }
}

/** ヒントを見た。先輩が次の一手を教えてくれるが、作中の時計が飛ぶ */
export function stageHint(
  def: StageDefinition,
  session: StageSession,
  at: number,
  untimed: boolean,
): StageStep {
  if (session.cleared) return { session, cues: [], result: null }
  const { drama, cues } = drive(def, session, untimed, [
    { type: 'hint', at, durationSec: def.hintSec ?? DEFAULT_DURATION_SEC.hint },
    { type: 'note', at, from: 'senpai', key: def.hint(session.world, session.progress) },
  ])
  return { session: { ...session, drama }, cues, result: null }
}

/** エディタでファイルを書き換えた（コマンドではないので、演出エンジンには渡さない） */
export function stageEdit(session: StageSession, path: string, content: string): StageSession {
  return { ...session, world: writeFile(session.world, session.cwd, path, content) }
}

/** 致命的な危険の直前に戻る。始末書と機嫌の減りはそのまま（やらかした事実は消えない） */
export function stageRollback(
  def: StageDefinition,
  session: StageSession,
  at: number,
  untimed: boolean,
): StageStep {
  if (!session.checkpoint) return { session, cues: [], result: null }
  const { drama, cues } = drive(def, session, untimed, [
    { type: 'note', at, from: 'senpai', key: 'senpai.rollback' },
  ])
  return {
    session: { ...session, world: session.checkpoint, checkpoint: null, drama },
    cues,
    result: null,
  }
}
