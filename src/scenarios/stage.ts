// ステージ（シナリオ1本）の進行。エンジンでコマンドを実行し、シナリオの判定と演出エンジンをつなぐ。
// 画面に依存しない（時刻は呼び出し側から受け取る）ので、解答手順をそのままテストできる。
//
// シナリオが決められること（docs/07 の要望）：
// - コマンドごとの判定（マイルストーン、場面のセリフ、ゴール、NPC の操作）
// - チャットの選択肢（条件つき）と、その結果
// - 作中の時刻をきっかけにした出来事（部長の発言、NPC の push、締切の変更、時間切れの結末）
// - ヘッダーに出す数（待機室の人数、問い合わせの件数 など）
import {
  type Character,
  type Cue,
  type DangerKind,
  type DangerSignal,
  type DramaInput,
  type DramaSettings,
  type DramaState,
  type EndingLine,
  initDrama,
  isObservation,
  type Rank,
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
  /** セリフの {名前} を差し替える値 */
  vars?: Record<string, string>
  /** 同じセリフを2度言わないための名前（既定は key）。{n} のように数が変わるものは、ここを変える */
  id?: string
  /** 何度でも言う */
  repeat?: boolean
}

export interface StageEnding {
  /** 結末のセリフの差し替え（key → key） */
  replace?: Record<string, string>
  /** 結末の最後に足すセリフ（始末書があるときは出ない） */
  epilogue?: { from: Character; key: string }[]
  /** 結末のセリフをまるごと決める */
  script?: EndingLine[]
  /** ランクの上限 */
  maxRank?: Rank
}

/** シナリオが判定して返すもの（コマンド・選択・時刻ごと） */
export interface StageEvaluation {
  /** 新たに満たしたマイルストーン */
  milestones: string[]
  /** 場面に応じたセリフ（間違った解消への反応など） */
  notes: StageNote[]
  /** ゴールを満たした */
  cleared: boolean
  /** 終わったときの結末の出し分け */
  ending?: StageEnding
  /** NPC が動いたあとの world（学習者のコマンドの後に、NPC が push してくる など） */
  world?: World
  /** NPC の操作として、ターミナルに出す行 */
  npcLog?: string[]
  /** 締切を変える（作中の秒。開始から数える） */
  deadlineSec?: number
  /** ゴールを満たさないまま終わる（部長の pull が先に終わった など）。ランクは D */
  end?: boolean
}

export const nothing = (): StageEvaluation => ({ milestones: [], notes: [], cleared: false })

/** シナリオが覚えておく進み具合（マイルストーン、言ったセリフ、拒否されたか など） */
export interface StageProgress {
  milestones: string[]
  said: string[]
  flags: string[]
  /** 選んだ選択肢（順に） */
  choices: string[]
  /** 起きた時刻の出来事 */
  fired: string[]
  /** シナリオが自由に使うメモ（JSON にできる文字列だけ） */
  memo: Record<string, string>
}

/** 判定のときに分かること */
export interface StageContext {
  /** 実時間の経過（ミリ秒） */
  at: number
  /** 作中の経過秒（開始から。コマンドの所要時間も含む） */
  gameSec: number
  /** 締切を過ぎたか */
  late: boolean
  /** このコマンドで起きた危険（コマンドのときだけ） */
  dangers: DangerSignal[]
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
  /** 損害額の内訳（やらかし道場） */
  cost?: string
}

/** 画面に出すゴールの1行 */
export interface StageGoal {
  text: string
  done: boolean
}

/** チャットの選択肢 */
export interface StageChoice {
  id: string
  text: string
  trust?: number
  mood?: number
  /** 出す条件（なければいつでも） */
  available?(world: World, progress: StageProgress): boolean
  /** 選んだ後も残す（答え直せる問いなど） */
  repeatable?: boolean
}

/** ヘッダーに出す数 */
export interface StageStatus {
  label: string
  value: string
  tone?: 'normal' | 'warn' | 'danger'
}

export interface StageDefinition {
  id: string
  /** 章とステージの番号（'1-2' など） */
  number: string
  title: string
  /** 「今日のしごと」カード */
  mission: { task: string; due: string }
  /** いまの状況の説明（導入で見せる）。何がすでに終わっていて、何が残っているか */
  situation: string[]
  /** ターミナルの最初の案内（なければ「まずは git status」） */
  terminalIntro?: string
  /** 導入のチャット（3つ以内） */
  intro: { from: Character; text: string }[]
  home: string
  /** プレイヤーが作業するワークスペースのキー */
  workspace: string
  buildWorld(now: ExecContext['now']): World
  drama: Omit<DramaSettings, 'untimed'>
  policy: DangerPolicy
  /** 進み具合で変わる危険の扱い（周知してからの --force-with-lease を許す など）。なければ policy */
  policyFor?(progress: StageProgress): DangerPolicy
  /** チェックポイントを作る危険（なければ force push・秘密情報・作業の消失・.git の削除） */
  fatalKinds?: DangerKind[]
  /** 致命的な危険のあと、その直前に戻れるようにする（実戦型） */
  checkpointOnFatal: boolean
  evaluate(
    before: World,
    result: ExecuteResult,
    command: string,
    progress: StageProgress,
    ctx: StageContext,
  ): StageEvaluation
  chips(world: World, progress: StageProgress): Chip[]
  /** ゴールの一覧と、いま達成しているか（すべて達成でクリア） */
  goals(world: World, progress: StageProgress, reports: DangerKind[]): StageGoal[]
  /** ヒントを見たときに先輩が言うセリフの key（いまの進み具合に合わせる） */
  hint(world: World, progress: StageProgress): string
  /** 手が止まったときに先輩が言うセリフの key（間違えた後など）。なければ senpai.idle を段階的に */
  helper?(world: World, progress: StageProgress): string | undefined
  /** ヒント1回で飛ぶ作中の秒。なければ DEFAULT_DURATION_SEC.hint */
  hintSec?: number
  /** コマンドの所要時間（作中の秒、docs/06 の 2.2）。なければ DEFAULT_DURATION_SEC で決める */
  durationOf?(command: string, result: ExecuteResult): number | undefined
  /** チャットの選択肢 */
  choices?: StageChoice[]
  onChoice?(id: string, world: World, progress: StageProgress, ctx: StageContext): StageEvaluation
  /** 作中の時刻をきっかけにした出来事（atSec は開始からの作中の秒） */
  timeline?: { id: string; atSec: number }[]
  onTime?(id: string, world: World, progress: StageProgress, ctx: StageContext): StageEvaluation
  /** ヘッダーに出す数 */
  status?(world: World, progress: StageProgress, gameSec: number): StageStatus[]
  /** world だけを最初に戻すボタン（やらかし道場）。始末書と損害額は残る */
  resetWorld?: { label: string; note: StageNote }
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
  /** 終わった（クリア、または時間切れなどで終わり） */
  over: boolean
  /** 途中で変わった締切（作中の秒） */
  deadlineSec?: number
  /** 始めたときの world（やらかし道場の「元に戻す」に使う） */
  initialWorld: World
}

export interface StageStep {
  session: StageSession
  cues: Cue[]
  result: ExecuteResult | null
  /** NPC の操作として、ターミナルに出す行 */
  npcLog?: string[]
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
  'REPO_DELETED',
]

export function startStage(
  def: StageDefinition,
  now: ExecContext['now'],
  untimed: boolean,
): StageStep {
  const world = def.buildWorld(now)
  const { state, cues } = initDrama(settingsOf(def, undefined, untimed), stateHash(world))
  return {
    session: {
      world,
      cwd: def.workspace,
      drama: state,
      progress: { milestones: [], said: [], flags: [], choices: [], fired: [], memo: {} },
      checkpoint: null,
      cleared: false,
      over: false,
      initialWorld: world,
    },
    cues,
    result: null,
  }
}

function settingsOf(
  def: StageDefinition,
  session: StageSession | undefined,
  untimed: boolean,
): DramaSettings {
  return {
    ...def.drama,
    untimed,
    ...(session?.deadlineSec !== undefined
      ? { deadlineSec: deadlineRealSec(def, session.deadlineSec) }
      : {}),
    choices: [
      ...(def.drama.choices ?? []),
      ...(def.choices ?? []).map(({ id, trust, mood }) => ({ id, trust, mood })),
    ],
  }
}

/** 作中の秒の締切を、演出エンジンが数える実時間の秒にする */
function deadlineRealSec(def: StageDefinition, gameSec: number): number {
  return gameSec / (def.drama.clockScale ?? 1)
}

/** 作中の経過秒（開始から） */
export function gameSecOf(def: StageDefinition, session: StageSession, at: number): number {
  return Math.floor((at / 1000) * (def.drama.clockScale ?? 1)) + session.drama.extraClockSec
}

function contextOf(
  def: StageDefinition,
  session: StageSession,
  at: number,
  dangers: DangerSignal[] = [],
): StageContext {
  const gameSec = gameSecOf(def, session, at)
  const deadline =
    session.deadlineSec ??
    (def.drama.deadlineSec !== undefined
      ? def.drama.deadlineSec * (def.drama.clockScale ?? 1)
      : undefined)
  return { at, gameSec, late: deadline !== undefined && gameSec > deadline, dangers }
}

function drive(
  def: StageDefinition,
  session: StageSession,
  untimed: boolean,
  inputs: DramaInput[],
): { drama: DramaState; cues: Cue[] } {
  const settings = settingsOf(def, session, untimed)
  let drama = session.drama
  const cues: Cue[] = []
  for (const input of inputs) {
    const r = stepDrama(drama, input, settings)
    drama = r.state
    cues.push(...r.cues)
  }
  return { drama, cues }
}

const copyProgress = (p: StageProgress): StageProgress => ({
  milestones: [...p.milestones],
  said: [...p.said],
  flags: [...p.flags],
  choices: [...p.choices],
  fired: [...p.fired],
  memo: { ...p.memo },
})

/**
 * シナリオの判定を、演出エンジンへの入力と新しいセッションにする。
 * first は判定より先に入れる入力（コマンドそのもの、選択 など）
 */
function apply(
  def: StageDefinition,
  session: StageSession,
  world: World,
  progress: StageProgress,
  evaluation: StageEvaluation,
  first: DramaInput[],
  at: number,
  untimed: boolean,
): { session: StageSession; cues: Cue[] } {
  progress.milestones.push(...evaluation.milestones.filter((m) => !progress.milestones.includes(m)))
  const inputs: DramaInput[] = [...first]
  for (const n of evaluation.notes) {
    const id = n.id ?? n.key
    if (!n.repeat && progress.said.includes(id)) continue
    if (!n.repeat) progress.said.push(id)
    const { id: _, repeat: __, ...note } = n
    inputs.push({ type: 'note', at, ...note })
  }
  const next: StageSession = {
    ...session,
    world: evaluation.world ?? world,
    progress,
    ...(evaluation.deadlineSec !== undefined ? { deadlineSec: evaluation.deadlineSec } : {}),
  }
  const finished = evaluation.cleared || evaluation.end === true
  if (finished) {
    inputs.push({
      type: 'finish',
      at,
      ...evaluation.ending,
      ...(evaluation.cleared ? {} : { failed: true }),
    })
  }
  const { drama, cues } = drive(def, next, untimed, inputs)
  return {
    session: { ...next, drama, cleared: evaluation.cleared, over: finished },
    cues,
  }
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
  if (session.over) return { session, cues: [], result: null }
  const before = session.world
  const result = execute(before, command, {
    workspace: session.cwd,
    now,
    tty: true,
    home: def.home,
  })
  const input = {
    ...commandInput({
      command,
      workspace: session.cwd,
      result,
      at,
      milestones: [],
      policy: def.policyFor?.(session.progress) ?? def.policy,
    }),
    durationSec: durationOf(def, command, result),
  }
  const progress = copyProgress(session.progress)
  // 判定は、このコマンドの所要時間ぶん時計が進んだ後の時刻で行う
  const ctx = contextOf(def, session, at, input.dangers)
  ctx.gameSec += input.durationSec
  const evaluation = def.evaluate(before, result, command, progress, ctx)
  input.milestones = evaluation.milestones.filter((m) => !progress.milestones.includes(m))

  const moved = { ...session, cwd: result.cwd ?? session.cwd }
  const applied = apply(def, moved, result.world, progress, evaluation, [input], at, untimed)
  const fatalKinds = def.fatalKinds ?? FATAL
  const fatal = input.dangers.some((d) => !d.allowed && fatalKinds.includes(d.kind))
  return {
    session: {
      ...applied.session,
      checkpoint: def.checkpointOnFatal && fatal ? before : session.checkpoint,
    },
    cues: applied.cues,
    result,
    ...(evaluation.npcLog ? { npcLog: evaluation.npcLog } : {}),
  }
}

/** いま出せる選択肢 */
export function availableChoices(def: StageDefinition, session: StageSession): StageChoice[] {
  if (session.over) return []
  return (def.choices ?? []).filter(
    (c) =>
      (c.repeatable || !session.progress.choices.includes(c.id)) &&
      (c.available?.(session.world, session.progress) ?? true),
  )
}

/** チャットの選択肢を選んだ */
export function stageChoose(
  def: StageDefinition,
  session: StageSession,
  id: string,
  at: number,
  untimed: boolean,
): StageStep {
  if (!availableChoices(def, session).some((c) => c.id === id)) {
    return { session, cues: [], result: null }
  }
  const progress = copyProgress(session.progress)
  progress.choices.push(id)
  const evaluation =
    def.onChoice?.(id, session.world, progress, contextOf(def, session, at)) ?? nothing()
  const applied = apply(
    def,
    session,
    session.world,
    progress,
    evaluation,
    [{ type: 'choice', at, id }],
    at,
    untimed,
  )
  return {
    ...applied,
    result: null,
    ...(evaluation.npcLog ? { npcLog: evaluation.npcLog } : {}),
  }
}

/** 時間の経過（画面が1秒ごとに呼ぶ）。作中の時刻の出来事もここで起こす */
export function stageTick(
  def: StageDefinition,
  session: StageSession,
  at: number,
  untimed: boolean,
): StageStep {
  if (session.over) return { session, cues: [], result: null }
  const helperKey = def.helper?.(session.world, session.progress)
  const ticked = drive(def, session, untimed, [{ type: 'tick', at, helperKey }])
  let current: StageSession = { ...session, drama: ticked.drama }
  const cues = [...ticked.cues]
  const npcLog: string[] = []

  const ctx = contextOf(def, current, at)
  for (const event of def.timeline ?? []) {
    if (current.over) break
    if (event.atSec > ctx.gameSec || current.progress.fired.includes(event.id)) continue
    const progress = copyProgress(current.progress)
    progress.fired.push(event.id)
    const evaluation =
      def.onTime?.(event.id, current.world, progress, contextOf(def, current, at)) ?? nothing()
    const applied = apply(def, current, current.world, progress, evaluation, [], at, untimed)
    current = applied.session
    cues.push(...applied.cues)
    npcLog.push(...(evaluation.npcLog ?? []))
  }
  return { session: current, cues, result: null, ...(npcLog.length > 0 ? { npcLog } : {}) }
}

/** ヒントを見た。先輩が次の一手を教えてくれるが、作中の時計が飛ぶ */
export function stageHint(
  def: StageDefinition,
  session: StageSession,
  at: number,
  untimed: boolean,
): StageStep {
  if (session.over) return { session, cues: [], result: null }
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

/** world だけを最初に戻す（やらかし道場）。始末書・ゲージ・進み具合はそのまま */
export function stageResetWorld(
  def: StageDefinition,
  session: StageSession,
  at: number,
  untimed: boolean,
): StageStep {
  if (!def.resetWorld || session.over) return { session, cues: [], result: null }
  const { id: _, repeat: __, ...note } = def.resetWorld.note
  const { drama, cues } = drive(def, session, untimed, [{ type: 'note', at, ...note }])
  return {
    session: {
      ...session,
      world: session.initialWorld,
      cwd: def.workspace,
      checkpoint: null,
      drama,
    },
    cues,
    result: null,
  }
}
