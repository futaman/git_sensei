// 演出エンジン本体（docs/04）。入力（コマンドの結果・選択・時間の経過）を受け取り、
// 後輩の信頼・上司の機嫌・時計を更新して、演出キュー（Cue）を返す。
// 純粋な関数：同じ設定・同じ入力の列なら、いつも同じ状態と同じキューになる（リプレイできる）。
import { classify, isObservation } from './classify.ts'
import { remainingMs } from './clock.ts'
import { DRAMA } from './drama.config.ts'
import { DEFAULT_LINES, ESCALATING } from './lines.ts'
import { moodStageOf, trustStageOf, trustStageWithHysteresis } from './stages.ts'
import type {
  Category,
  Character,
  Cue,
  DramaInput,
  DramaSettings,
  DramaState,
  Rank,
} from './types.ts'

export interface DramaStep {
  state: DramaState
  cues: Cue[]
}

/** シナリオの開始。initialHash は開始時点の「意味のある状態」のハッシュ */
export function initDrama(settings: DramaSettings, initialHash: string): DramaStep {
  const trust = clamp(settings.initialTrust ?? DRAMA.trust.initial)
  const mood = clamp(settings.initialMood ?? DRAMA.mood.initial)
  const state: DramaState = {
    trust,
    trustStage: trustStageOf(trust),
    mood,
    moodStage: moodStageOf(mood),
    visited: { [initialHash]: true },
    lastHash: initialHash,
    lastCategory: null,
    streak: 0,
    consecutiveErrors: 0,
    observeLoop: { command: '', count: 0 },
    moves: 0,
    dangers: 0,
    reports: [],
    smartUsed: {},
    lastActivityAt: 0,
    extraClockSec: 0,
    helperHints: 0,
    idleStrikes: 0,
    idleNoticed: false,
    deadlineLevel: 'none',
    overtimeStrikes: 0,
    thunder: false,
    rng: settings.seed >>> 0 || 1,
    lastLine: {},
    finished: null,
  }
  const cues: Cue[] = [{ type: 'gauge', trust, mood, trustDelta: 0, moodDelta: 0 }]
  if (settings.cast.includes('kouhai')) {
    cues.push({ type: 'face', who: 'kouhai', stage: state.trustStage, direction: 'up' })
  }
  if (settings.cast.includes('boss')) cues.push({ type: 'mood', stage: state.moodStage })
  return { state, cues }
}

const clamp = (v: number) => Math.max(0, Math.min(100, v))

/** 1ステップ進める。終わったシナリオ（finish 済み）には何もしない */
export function stepDrama(prev: DramaState, input: DramaInput, settings: DramaSettings): DramaStep {
  if (prev.finished) return { state: prev, cues: [] }
  const run = new Run(structuredClone(prev), settings)
  run.passTime(input.at, input.type === 'tick' ? input.helperKey : undefined)
  switch (input.type) {
    case 'tick':
      break
    case 'hint':
      run.trust(DRAMA.trust.delta.hint)
      run.say('kouhai', 'kouhai.hint', 'whisper')
      run.advanceClock(input.durationSec ?? 0)
      run.activity(input.at)
      break
    case 'note':
      // シナリオが決めた場面のセリフ。手は動いていないので、手が止まった数え直しはしない
      if (input.trust) run.trust(input.trust)
      if (input.mood) run.mood(input.mood)
      run.say(input.from, input.key, 'normal', undefined, input.vars)
      break
    case 'choice': {
      const effect = settings.choices?.find((c) => c.id === input.id)
      if (effect?.trust) run.trust(effect.trust)
      if (effect?.mood) run.mood(effect.mood)
      run.activity(input.at)
      break
    }
    case 'command':
      run.command(input)
      run.advanceClock(input.durationSec ?? 0)
      run.activity(input.at)
      break
    case 'finish':
      run.finish(input)
      break
  }
  return run.done()
}

/** 1ステップ分の作業場所。状態を書き換えながら、キューをためる */
class Run {
  readonly s: DramaState
  readonly settings: DramaSettings
  readonly cues: Cue[] = []
  private trustDelta = 0
  private moodDelta = 0
  private readonly kouhai: boolean
  private readonly boss: boolean

  constructor(state: DramaState, settings: DramaSettings) {
    this.s = state
    this.settings = settings
    this.kouhai = settings.cast.includes('kouhai')
    this.boss = settings.cast.includes('boss')
  }

  trust(delta: number): void {
    if (!this.kouhai || delta === 0) return
    const before = this.s.trust
    this.s.trust = clamp(before + delta)
    this.trustDelta += this.s.trust - before
  }

  mood(delta: number): void {
    if (!this.boss || delta === 0) return
    const before = this.s.mood
    this.s.mood = clamp(before + delta)
    this.moodDelta += this.s.mood - before
  }

  /** セリフを1つ選んでチャットに出す。level を渡すと、その段階の候補（きつさ）を使う */
  say(
    from: Character,
    key: string,
    style: 'normal' | 'rage' | 'whisper',
    level?: number,
    vars?: Record<string, string>,
  ): void {
    // system（お知らせ）は配役に関係なく出す
    if (from !== 'system' && !this.settings.cast.includes(from)) return
    const candidates = this.settings.lines?.[key] ?? DEFAULT_LINES[key]
    if (!candidates || candidates.length === 0) return
    let index: number
    if (level !== undefined && ESCALATING.has(key)) {
      index = Math.min(level - 1, candidates.length - 1)
    } else {
      index = this.random(candidates.length)
      // 直前と同じセリフは避ける
      if (candidates.length > 1 && index === this.s.lastLine[key])
        index = (index + 1) % candidates.length
    }
    this.s.lastLine[key] = index
    const text = (candidates[index] as string).replace(/\{(\w+)\}/g, (m, name: string) =>
      vars && Object.hasOwn(vars, name) ? (vars[name] as string) : m,
    )
    this.cues.push({ type: 'chat', from, key, text, style })
  }

  /** シードつきの乱数（mulberry32）。状態に種を持つので再現できる */
  private random(n: number): number {
    this.s.rng = (this.s.rng + 0x6d2b79f5) >>> 0
    let t = this.s.rng
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296
    return Math.floor(r * n)
  }

  activity(at: number): void {
    this.s.lastActivityAt = at
    this.s.idleStrikes = 0
    this.s.idleNoticed = false
  }

  /** 実時間に、時計が飛んだぶん（作中の秒 ÷ clockScale）を足した経過ミリ秒 */
  effectiveAt(at: number): number {
    return at + (this.s.extraClockSec * 1000) / (this.settings.clockScale ?? 1)
  }

  hasLine(key: string): boolean {
    return (this.settings.lines?.[key] ?? DEFAULT_LINES[key] ?? []).length > 0
  }

  /** 所要時間のぶん作中の時計を進める（docs/06 §2.2） */
  advanceClock(seconds: number): void {
    if (seconds <= 0) return
    this.s.extraClockSec += seconds
    this.cues.push({ type: 'clock', jumpedSec: seconds, extraSec: this.s.extraClockSec })
  }

  /** 前の入力から at までの時間の経過：手が止まったときの反応と、期限（docs/04 §8） */
  passTime(at: number, helperKey?: string): void {
    const idle = DRAMA.idle
    const since = at - this.s.lastActivityAt
    // 手が止まったことに気づく（減点なし）。時間制限なしモードでも、助け舟は出す
    if (since >= idle.noticeMs && !this.s.idleNoticed) {
      this.s.idleNoticed = true
      if (this.kouhai) this.cues.push({ type: 'typing', who: 'kouhai', vanish: false })
      if (this.settings.idleHelper && this.settings.cast.includes('senpai')) {
        this.s.helperHints++
        this.say('senpai', helperKey ?? 'senpai.idle', 'normal', this.s.helperHints)
      }
    }
    if (this.settings.untimed) return
    const strikes =
      since >= idle.penaltyFromMs
        ? 1 + Math.floor((since - idle.penaltyFromMs) / idle.penaltyEveryMs)
        : 0
    while (this.kouhai && this.s.idleStrikes < strikes) {
      this.s.idleStrikes++
      this.trust(DRAMA.trust.delta.idle)
      this.cues.push({ type: 'typing', who: 'kouhai', vanish: true })
    }

    // 所要時間で時計が飛んだぶん、期限も近づく
    const remaining = remainingMs(this.settings, this.effectiveAt(at))
    if (remaining === null) return
    const total = (this.settings.deadlineSec as number) * 1000
    const ratio = remaining / total
    const levels = ['none', 'warning', 'urgent', 'over'] as const
    const target =
      remaining <= 0
        ? 'over'
        : ratio <= DRAMA.deadline.urgentRatio
          ? 'urgent'
          : ratio <= DRAMA.deadline.warningRatio
            ? 'warning'
            : 'none'
    // 途中の段階を飛ばさないよう、1つずつ進める
    while (levels.indexOf(this.s.deadlineLevel) < levels.indexOf(target)) {
      const next = levels[levels.indexOf(this.s.deadlineLevel) + 1] as (typeof levels)[number]
      this.s.deadlineLevel = next
      if (next === 'none') continue
      this.cues.push({ type: 'deadline', level: next })
      if (next === 'urgent') this.say('boss', 'boss.deadlineUrgent', 'normal')
    }
    if (remaining < 0) {
      const units = Math.floor(-remaining / DRAMA.mood.overtimeEveryMs)
      while (this.s.overtimeStrikes < units) {
        this.s.overtimeStrikes++
        this.mood(DRAMA.mood.overtime)
        // 催促は毎回ではなく、3回に1回
        if (this.s.overtimeStrikes % 3 === 1) this.say('boss', 'boss.overtime', 'normal')
      }
    }
  }

  command(input: Extract<DramaInput, { type: 'command' }>): void {
    const s = this.s
    const category = classify(s, input)
    s.streak = category === s.lastCategory ? s.streak + 1 : 1
    // 見るだけのコマンドは、マイルストーンを満たしても手数に数えない
    if (category !== 'observe' && category !== 'unsupported' && !isObservation(input.command))
      s.moves++
    if (category !== 'error') s.consecutiveErrors = 0

    // 危険に見える操作（許可されたものも含む）の直前に確認していた
    if (input.dangers.length > 0 && s.lastCategory === 'observe') {
      this.trust(DRAMA.trust.delta.observeBeforeDanger)
      this.say('kouhai', 'kouhai.observeBeforeDanger', 'whisper')
    }
    // スマート解（同じものは1回だけ）
    for (const smart of this.settings.smartMoves ?? []) {
      if (category === 'error' || s.smartUsed[smart.id]) continue
      if (new RegExp(smart.pattern).test(input.command)) {
        s.smartUsed[smart.id] = true
        this.trust(DRAMA.trust.delta.smart)
        this.say('kouhai', 'kouhai.smart', 'normal')
      }
    }

    const d = DRAMA.trust.delta
    switch (category) {
      case 'danger':
        this.danger(input.dangers)
        break
      case 'error':
        s.consecutiveErrors++
        this.trust(d.error * s.consecutiveErrors)
        this.say('kouhai', 'kouhai.error', 'whisper', s.consecutiveErrors)
        break
      case 'observe': {
        const normalized = input.command.trim().replace(/\s+/g, ' ')
        const sameAsBefore = s.observeLoop.command === normalized && input.stateHash === s.lastHash
        s.observeLoop = { command: normalized, count: sameAsBefore ? s.observeLoop.count + 1 : 1 }
        if (s.observeLoop.count >= d.observeLoopFrom) {
          this.trust(d.observeLoop)
          this.say('kouhai', 'kouhai.observeLoop', 'whisper')
        }
        break
      }
      case 'progress': {
        this.trust(d.progress * input.milestones.length)
        // シナリオがマイルストーンごとのセリフ（milestone.<id>）を用意していれば、そちらを使う
        const own = input.milestones.find((m) => this.hasLine(`milestone.${m}`))
        this.say('kouhai', own ? `milestone.${own}` : 'kouhai.progress', 'normal')
        break
      }
      case 'quickfix':
        this.trust(d.quickfix)
        this.say('kouhai', 'kouhai.quickfix', 'whisper')
        break
      case 'regress':
        this.trust(d.regress)
        this.say('kouhai', 'kouhai.regress', 'whisper', s.streak)
        break
      case 'noop':
        this.trust(d.noop)
        this.say('kouhai', 'kouhai.noop', 'whisper')
        break
      case 'normal':
      case 'unsupported':
        break
    }
    if (category !== 'observe') s.observeLoop = { command: '', count: 0 }
    s.visited[input.stateHash] = true
    s.lastHash = input.stateHash
    s.lastCategory = category as Category
  }

  private danger(signals: Extract<DramaInput, { type: 'command' }>['dangers']): void {
    const live = signals.filter((d) => !d.allowed)
    this.s.dangers += live.length
    this.trust(DRAMA.trust.delta.danger)
    this.say('kouhai', 'kouhai.danger', 'normal')
    let worst: 'fatal' | 'major' | 'minor' = 'minor'
    for (const d of live) {
      const rule = DRAMA.dangers[d.kind]
      this.mood(rule.mood)
      if (rule.severity === 'fatal' || (rule.severity === 'major' && worst === 'minor')) {
        worst = rule.severity
      }
      if (!this.s.reports.includes(d.kind)) {
        this.s.reports.push(d.kind)
        this.cues.push({ type: 'report', kind: d.kind, level: d.level ?? rule.level })
      }
      this.say('boss', `boss.danger.${d.kind}`, rule.severity === 'minor' ? 'normal' : 'rage')
    }
    if (!this.boss) return
    if (worst === 'fatal') {
      this.cues.push(
        { type: 'cutin', who: 'boss', variant: 'rage' },
        { type: 'shake', intensity: 2 },
      )
    } else if (worst === 'major') {
      this.cues.push({ type: 'shake', intensity: 1 })
    }
  }

  finish(input: Extract<DramaInput, { type: 'finish' }>): void {
    const remaining = remainingMs(this.settings, this.effectiveAt(input.at))
    const key = (k: string) => input.replace?.[k] ?? k
    const onTime = remaining === null || remaining >= 0
    if (remaining !== null && remaining > 0) {
      const { min, max } = DRAMA.mood.earlyFinish
      const ratio = remaining / ((this.settings.deadlineSec as number) * 1000)
      this.mood(Math.round(min + (max - min) * ratio))
    }
    // ランクより先に、物語の結末を見せる（docs/06 §7 の「余韻」）
    const reported = this.s.reports.length > 0 && this.settings.cast.includes('senpai')
    if (input.script) {
      for (const e of input.script) this.say(e.from, e.key, 'normal', undefined, e.vars)
    } else if (reported) {
      this.say('senpai', key('ending.afterReport'), 'normal')
    } else if (onTime) {
      this.say('boss', key('ending.onTime'), 'normal')
      this.say('kouhai', key('ending.thanks'), 'normal')
    } else {
      this.say('boss', key('ending.late'), 'normal')
    }
    if (!reported && !input.script)
      for (const e of input.epilogue ?? []) this.say(e.from, e.key, 'normal')
    const ORDER: Rank[] = ['S', 'A', 'B', 'C', 'D']
    const raw = input.failed ? 'D' : this.rank(onTime)
    const cap = input.maxRank ?? 'S'
    const rank = ORDER.indexOf(raw) < ORDER.indexOf(cap) ? cap : raw
    const slow = this.settings.untimed
    this.s.finished = { rank, slow }
    this.cues.push({ type: 'rank', rank, slow })
    this.say('kouhai', `kouhai.rank.${rank}`, rank === 'D' ? 'whisper' : 'normal')
    if (rank === 'S' && this.kouhai)
      this.cues.push({ type: 'cutin', who: 'kouhai', variant: 'sparkle' })
  }

  private rank(withinDeadline: boolean): Rank {
    const { par } = this.settings
    const r = DRAMA.rank
    const s = this.s
    if (this.kouhai && s.trust < r.dTrust) return 'D'
    const trustOk = !this.kouhai || s.trust >= r.sTrust
    if (s.moves <= par && s.dangers === 0 && trustOk && withinDeadline) return 'S'
    if (s.moves <= par + r.aExtraMoves) return 'A'
    if (s.moves <= par + r.bExtraMoves) return 'B'
    return 'C'
  }

  /** 段階の変化・雷・ゲージのキューを足して終える */
  done(): DramaStep {
    const s = this.s
    if (this.kouhai) {
      const stage = trustStageWithHysteresis(s.trustStage, s.trust)
      if (stage !== s.trustStage) {
        const order = DRAMA.trust.stages.map((x) => x.stage as string)
        const direction = order.indexOf(stage) < order.indexOf(s.trustStage) ? 'up' : 'down'
        s.trustStage = stage
        this.cues.push({ type: 'face', who: 'kouhai', stage, direction })
      }
    }
    if (this.boss) {
      const stage = moodStageOf(s.mood)
      if (stage !== s.moodStage) {
        s.moodStage = stage
        this.cues.push({ type: 'mood', stage })
      }
      if (s.mood <= 0 && !s.thunder) {
        s.thunder = true
        this.cues.push(
          { type: 'cutin', who: 'boss', variant: 'thunder' },
          { type: 'shake', intensity: 3 },
        )
        this.say('boss', 'boss.thunder', 'rage')
      }
    }
    if (this.trustDelta !== 0 || this.moodDelta !== 0) {
      this.cues.push({
        type: 'gauge',
        trust: s.trust,
        mood: s.mood,
        trustDelta: this.trustDelta,
        moodDelta: this.moodDelta,
      })
    }
    return { state: s, cues: this.cues }
  }
}
