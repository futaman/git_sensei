// 演出の数値（docs/04）。すべて仮の値で、遊んでから調整する（docs/04 §9）。
import type { DangerKind, MoodStage, Severity, TrustStage, YabaLevel } from './types.ts'

export const DRAMA = {
  trust: {
    initial: 80,
    /** 段階の境目をまたいでも、この幅だけ離れるまで表情を変えない */
    hysteresis: 3,
    stages: [
      { stage: 'admire', min: 85 },
      { stage: 'expect', min: 65 },
      { stage: 'worry', min: 45 },
      { stage: 'doubt', min: 25 },
      { stage: 'void', min: 0 },
    ] satisfies { stage: TrustStage; min: number }[],
    delta: {
      progress: 5,
      smart: 8,
      quickfix: 2,
      observeBeforeDanger: 3,
      noop: -4,
      regress: -6,
      /** 連続したエラーの n 回目は error * n */
      error: -3,
      observeLoop: -2,
      /** 状態が変わらないまま同じ観測を、この回数目から減点する */
      observeLoopFrom: 3,
      hint: -5,
      idle: -2,
      danger: -15,
    },
  },
  mood: {
    initial: 50,
    stages: [
      { stage: 'good', min: 80 },
      { stage: 'normal', min: 40 },
      { stage: 'grumpy', min: 15 },
      { stage: 'boiling', min: 1 },
      { stage: 'thunder', min: 0 },
    ] satisfies { stage: MoodStage; min: number }[],
    /** 期限を過ぎたら、この間隔（ミリ秒）ごとに減らす */
    overtimeEveryMs: 10_000,
    overtime: -2,
    /** 期限より早く解決したとき、残り時間の割合に応じて加える最小・最大 */
    earlyFinish: { min: 5, max: 15 },
  },
  /**
   * 危険の重さ（機嫌の減り方）と、ヤバ度の既定（docs/06 §2.1 の対応表）。
   * ヤバ度は1件ごとのラベルで、広がり方（push 済みか など）によってシナリオ側が上げてよい
   */
  dangers: {
    SECRET_PUSHED: { severity: 'fatal', mood: -50, level: 5 },
    FORCE_PUSH_OVERWROTE: { severity: 'fatal', mood: -45, level: 4 },
    UNCOMMITTED_CHANGES_DISCARDED: { severity: 'fatal', mood: -30, level: 3 },
    DIRECT_PUSH_TO_PROTECTED: { severity: 'major', mood: -25, level: 3 },
    HISTORY_REWRITTEN_ON_SHARED_BRANCH: { severity: 'major', mood: -20, level: 4 },
    CONFLICT_MARKER_COMMITTED: { severity: 'minor', mood: -10, level: 2 },
    BAD_COMMIT_MESSAGE: { severity: 'minor', mood: -5, level: 1 },
    JUNK_STAGED: { severity: 'minor', mood: -5, level: 1 },
    COMMITS_ORPHANED: { severity: 'minor', mood: -10, level: 2 },
    REPO_DELETED: { severity: 'major', mood: -30, level: 5 },
  } satisfies Record<DangerKind, { severity: Severity; mood: number; level: YabaLevel }>,
  idle: {
    /** この時間（ミリ秒）手が止まると後輩に「…」が出る（減点なし） */
    noticeMs: 20_000,
    /** ここから penaltyEveryMs ごとに信頼を減らす */
    penaltyFromMs: 45_000,
    penaltyEveryMs: 30_000,
  },
  deadline: {
    /** 残りがこの割合を切ったら表示を強調する */
    warningRatio: 0.3,
    /** 残りがこの割合を切ったら上司が催促する */
    urgentRatio: 0.1,
  },
  rank: {
    /** S：手数 ≤ par、危険0、信頼がこれ以上、期限内 */
    sTrust: 85,
    aExtraMoves: 2,
    bExtraMoves: 5,
    /** 最後の信頼がこれ未満なら、解決しても D */
    dTrust: 25,
  },
} as const
