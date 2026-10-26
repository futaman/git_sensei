// 演出エンジンの入力・状態・出力の型（docs/04 §7）。
import type { GitEvent } from '../engine/index.ts'

export type Character = 'kouhai' | 'boss' | 'senpai'

/** 後輩のまなざし（docs/04 §3.1）：憧れ / 期待 / 不安 / 疑心 / 虚無 */
export type TrustStage = 'admire' | 'expect' | 'worry' | 'doubt' | 'void'

/** 上司の機嫌（docs/04 §4.1）：上機嫌 / 普通 / 不機嫌 / 爆発寸前 / 雷 */
export type MoodStage = 'good' | 'normal' | 'grumpy' | 'boiling' | 'thunder'

/** 操作の分類（docs/04 §2.1）。quickfix は「ミスをすぐ打ち消した」、unsupported はシミュレータの未対応 */
export type Category =
  | 'danger'
  | 'error'
  | 'unsupported'
  | 'observe'
  | 'progress'
  | 'quickfix'
  | 'regress'
  | 'noop'
  | 'normal'

/** 危険な操作の種類（docs/04 §4.2）。エンジンのイベントと world から scenarios 層が判定する */
export type DangerKind =
  | 'SECRET_PUSHED'
  | 'FORCE_PUSH_OVERWROTE'
  | 'UNCOMMITTED_CHANGES_DISCARDED'
  | 'DIRECT_PUSH_TO_PROTECTED'
  | 'HISTORY_REWRITTEN_ON_SHARED_BRANCH'
  | 'BAD_COMMIT_MESSAGE'
  | 'JUNK_STAGED'
  | 'CONFLICT_MARKER_COMMITTED'

/** ヤバ度（docs/06 §2.1）。1件のやらかしの大きさのラベル。ゲージではない */
export type YabaLevel = 1 | 2 | 3 | 4 | 5

export type Severity = 'fatal' | 'major' | 'minor'

export interface DangerSignal {
  kind: DangerKind
  /** シナリオが許可している（周知してから --force-with-lease した、など）。減点しない */
  allowed: boolean
  /** 画面に出す補足（どのファイル、誰のコミットなど） */
  detail?: string
  /** ヤバ度。省略すると種類ごとの既定（drama.config.ts） */
  level?: YabaLevel
}

/** 演出エンジンへの入力。at はシナリオ開始からの経過ミリ秒（docs/04 §8.3） */
export type DramaInput =
  | {
      type: 'command'
      at: number
      command: string
      exitCode: number
      unsupported: boolean
      events: GitEvent[]
      /** 実行後の「意味のある状態」のハッシュ（engine の stateHash） */
      stateHash: string
      /** このコマンドで新たに満たしたマイルストーンの id */
      milestones: string[]
      dangers: DangerSignal[]
      /** このコマンドにかかった作中の時間（秒）。時計がその分だけ飛ぶ（docs/06 §2.2） */
      durationSec?: number
    }
  /** チャットで選んだ git 以外の行動（docs/04 §6） */
  | { type: 'choice'; at: number; id: string }
  /** ヒントを見た。durationSec だけ作中の時計が飛ぶ */
  | { type: 'hint'; at: number; durationSec?: number }
  /** シナリオが決めた場面で、セリフを出す（間違った解消への反応など）。信頼・機嫌も動かせる */
  | { type: 'note'; at: number; from: Character; key: string; trust?: number; mood?: number }
  /** 時間の経過を知らせる（手が止まったときの反応や期限に使う） */
  | {
      type: 'tick'
      at: number
      /** 先輩の助け舟で言うセリフの key。シナリオが状態を見て決める（間違えた後など）。なければ senpai.idle */
      helperKey?: string
    }
  /** ゴールを満たした。ランクを決める */
  | {
      type: 'finish'
      at: number
      /** 結末のセリフの差し替え（key → key）。シナリオが、遊び方に合わせて変える */
      replace?: Record<string, string>
      /** 結末の最後に足すセリフ。始末書があるときは出さない（ending.afterReport を優先する） */
      epilogue?: { from: Character; key: string }[]
    }

export type Rank = 'S' | 'A' | 'B' | 'C' | 'D'

/** 演出側（別セッション担当）に渡すキュー。セリフは key で識別し、text は差し替え前提の仮の文 */
export type Cue =
  | {
      type: 'chat'
      from: Character
      key: string
      text: string
      style: 'normal' | 'rage' | 'whisper'
    }
  | { type: 'face'; who: 'kouhai'; stage: TrustStage; direction: 'up' | 'down' }
  | { type: 'mood'; stage: MoodStage }
  | { type: 'cutin'; who: Character; variant: 'rage' | 'sparkle' | 'despair' | 'thunder' }
  | { type: 'shake'; intensity: 1 | 2 | 3 }
  | { type: 'typing'; who: Character; vanish: boolean }
  /** 始末書を初めて手に入れた（docs/04 §5） */
  | { type: 'report'; kind: DangerKind; level: YabaLevel }
  /** 作中の時計が飛んだ（所要時間のあるコマンドやヒント）。画面は数字を早送りで回す */
  | { type: 'clock'; jumpedSec: number; extraSec: number }
  | { type: 'deadline'; level: 'warning' | 'urgent' | 'over' }
  | { type: 'gauge'; trust: number; mood: number; trustDelta: number; moodDelta: number }
  | { type: 'rank'; rank: Rank; slow: boolean }

/** シナリオごとの演出の設定（docs/04 §7 の Scenario のうち、演出エンジンが使う部分） */
export interface DramaSettings {
  mode: 'experience' | 'practice'
  cast: Character[]
  /** 最短の手数（観測を除く） */
  par: number
  deadlineSec?: number
  /** 作中時計の開始時刻（'17:45'）。24時を過ぎると '25:12' のように数える */
  clockStart?: string
  /** 実時間1秒あたりに作中で進む秒数 */
  clockScale?: number
  /** 時間制限なしモード（docs/04 §8.4） */
  untimed: boolean
  initialTrust?: number
  initialMood?: number
  /** より良い書き方（正規表現の文字列）。使うと後輩の信頼が上がる */
  smartMoves?: { id: string; pattern: string }[]
  /** チャットの選択肢の効果 */
  choices?: { id: string; trust?: number; mood?: number }[]
  /** 手が止まったときに先輩が助け舟を出す（序盤の章）。先輩が cast にいるときだけ */
  idleHelper?: boolean
  /** つぶやきの選び方を決める乱数の種（同じ種なら同じ演出） */
  seed: number
  /** セリフの差し替え（key → 候補） */
  lines?: Record<string, string[]>
}

export interface DramaState {
  trust: number
  trustStage: TrustStage
  mood: number
  moodStage: MoodStage
  /** 通った状態のハッシュ */
  visited: Record<string, true>
  lastHash: string | null
  lastCategory: Category | null
  /** 同じ分類が何回続いたか（セリフを段階的にきつくする） */
  streak: number
  consecutiveErrors: number
  /** 状態が変わらないまま同じ観測コマンドを続けた回数 */
  observeLoop: { command: string; count: number }
  /** 観測以外のコマンドの数 */
  moves: number
  /** 許可されていない危険の数 */
  dangers: number
  /** 手に入れた始末書 */
  reports: DangerKind[]
  /** 使ったスマート解（同じものでは何度も加点しない） */
  smartUsed: Record<string, true>
  lastActivityAt: number
  /** コマンドやヒントの所要時間で、作中の時計が飛んだ合計（秒） */
  extraClockSec: number
  /** 先輩の助け舟を何回出したか */
  helperHints: number
  /** 手が止まったときの反応を何回出したか */
  idleStrikes: number
  idleNoticed: boolean
  deadlineLevel: 'none' | 'warning' | 'urgent' | 'over'
  /** 期限を過ぎてから機嫌を何回減らしたか */
  overtimeStrikes: number
  /** 雷が落ちた（実戦型ならチェックポイントからやり直し） */
  thunder: boolean
  rng: number
  /** セリフの key ごとに、直前に使った候補の番号 */
  lastLine: Record<string, number>
  finished: { rank: Rank; slow: boolean } | null
}
