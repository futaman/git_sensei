// ゲージの値から段階（表情・機嫌）を決める。
import { DRAMA } from './drama.config.ts'
import type { MoodStage, TrustStage } from './types.ts'

const TRUST = DRAMA.trust.stages
const MOOD = DRAMA.mood.stages

export function trustStageOf(value: number): TrustStage {
  return (TRUST.find((s) => value >= s.min)?.stage ?? 'void') as TrustStage
}

export function moodStageOf(value: number): MoodStage {
  return (MOOD.find((s) => value >= s.min)?.stage ?? 'thunder') as MoodStage
}

const rankOf = (stage: TrustStage) => TRUST.findIndex((s) => s.stage === stage)

/**
 * 表情がちらつかないよう、境目をまたいでも hysteresis だけ離れるまでは今の段階のままにする
 * （docs/04 §3.1）
 */
export function trustStageWithHysteresis(current: TrustStage, value: number): TrustStage {
  const next = trustStageOf(value)
  if (next === current) return current
  const i = rankOf(current)
  const band = TRUST[i] as { min: number }
  const upper = i === 0 ? Number.POSITIVE_INFINITY : (TRUST[i - 1] as { min: number }).min
  const h = DRAMA.trust.hysteresis
  // 下がるとき：今の段階の下限より h 以上下がったら。上がるとき：上の段階の下限より h 以上上がったら
  if (value <= band.min - h) return next
  if (value >= upper + h) return next
  return current
}
