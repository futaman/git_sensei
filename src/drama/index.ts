// ② 操作の分類と演出エンジン（docs/04）
// engine は型だけ import する。DOM・React・Date.now()・Math.random() は使わない。
// 出力は Cue（演出キュー）。セリフや見せ方は演出側の担当。

export { classify, isObservation } from './classify.ts'
export { clockText, remainingMs } from './clock.ts'
export { DRAMA } from './drama.config.ts'
export { type DramaStep, initDrama, stepDrama } from './engine.ts'
export { DEFAULT_LINES } from './lines.ts'
export { moodStageOf, trustStageOf, trustStageWithHysteresis } from './stages.ts'
export type * from './types.ts'
