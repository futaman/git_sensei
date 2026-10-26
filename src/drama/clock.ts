// 作中の時計（docs/04 §8.1）。実時間の経過（ミリ秒）から作中の時刻を求める。
import type { DramaSettings } from './types.ts'

/** '17:45' と経過ミリ秒から '18:02' のような作中の時刻。24時を過ぎても '25:12' と数え続ける */
export function clockText(
  settings: Pick<DramaSettings, 'clockStart' | 'clockScale'>,
  at: number,
): string {
  const [h = 0, m = 0] = (settings.clockStart ?? '09:00').split(':').map(Number)
  const seconds = h * 3600 + m * 60 + Math.floor((at / 1000) * (settings.clockScale ?? 1))
  const hh = Math.floor(seconds / 3600)
  const mm = Math.floor((seconds % 3600) / 60)
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

/** 期限までの残り（ミリ秒）。期限がない、または時間制限なしなら null */
export function remainingMs(
  settings: Pick<DramaSettings, 'deadlineSec' | 'untimed'>,
  at: number,
): number | null {
  if (settings.untimed || settings.deadlineSec === undefined) return null
  return settings.deadlineSec * 1000 - at
}
