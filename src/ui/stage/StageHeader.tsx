// ステージの上の帯：今日のしごと、作中の時計、後輩のまなざし、部長の機嫌、ヒント。
import { useEffect, useState } from 'react'
import { clockText, type MoodStage, type TrustStage } from '../../drama/index.ts'
import { gameSecOf } from '../../scenarios/stage.ts'
import { useStage } from '../store/stage.ts'

export const FACE: Record<TrustStage, { icon: string; label: string; gaze: string }> = {
  admire: { icon: '🤩', label: '憧れ', gaze: '先輩すごい…' },
  expect: { icon: '🙂', label: '期待', gaze: 'じっと見守っている' },
  worry: { icon: '😟', label: '不安', gaze: '大丈夫かな…' },
  doubt: { icon: '🤨', label: '疑心', gaze: 'この人、本当にわかってる…？' },
  void: { icon: '😶', label: '虚無', gaze: '…' },
}

export const MOOD: Record<MoodStage, { icon: string; label: string; ring: string }> = {
  good: { icon: '😌', label: '上機嫌', ring: 'ring-emerald-400' },
  normal: { icon: '😐', label: '普通', ring: 'ring-slate-300' },
  grumpy: { icon: '😠', label: '不機嫌', ring: 'ring-amber-400' },
  boiling: { icon: '😡', label: '爆発寸前', ring: 'ring-rose-500' },
  thunder: { icon: '⚡', label: '雷', ring: 'ring-yellow-400' },
}

const DEADLINE_CLASS = {
  none: 'text-slate-900',
  warning: 'text-amber-600',
  urgent: 'text-rose-600 animate-pulse',
  over: 'text-rose-700',
}

/** 作中の時計。時計が飛んだときは、0.6秒かけて数字を早送りで回す（docs/06 の 2.2） */
function Clock({ compact = false }: { compact?: boolean }) {
  const def = useStage((s) => s.def)
  const at = useStage((s) => s.at)
  const extra = useStage((s) => s.session?.drama.extraClockSec ?? 0)
  const jump = useStage((s) => s.clockJump)
  const deadline = useStage((s) => s.deadline)
  const untimed = useStage((s) => s.untimed)
  // 締切が途中で変わったら（レビュー会が早まった など）、変わった後の時刻を出す
  const movedDeadline = useStage((s) => s.session?.deadlineSec)
  const [shown, setShown] = useState<number | null>(null)

  useEffect(() => {
    if (!jump) return
    const start = performance.now()
    let frame = 0
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / 600)
      setShown(jump.fromSec + (jump.toSec - jump.fromSec) * p)
      if (p < 1) frame = requestAnimationFrame(step)
      else setShown(null)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [jump])

  if (!def) return null
  const text = clockText(def.drama, at, Math.floor(shown ?? extra))
  return (
    <div className="flex flex-col items-center leading-none" title="作中の時刻">
      <span
        className={`font-mono font-bold tabular-nums ${compact ? 'text-xl' : 'text-3xl'} ${shown !== null ? 'text-sky-600' : DEADLINE_CLASS[deadline]}`}
      >
        {text}
      </span>
      <span className={`mt-1 text-[10px] text-slate-500 ${compact ? 'hidden' : ''}`}>
        {untimed
          ? '時間制限なし'
          : deadline === 'over'
            ? '締切を過ぎた'
            : `締切 ${movedDeadline !== undefined ? clockText(def.drama, 0, movedDeadline) : def.mission.due}`}
      </span>
    </div>
  )
}

function KouhaiGauge({ compact = false }: { compact?: boolean }) {
  const def = useStage((s) => s.def)
  const face = useStage((s) => s.face)
  const trust = useStage((s) => s.trust)
  const delta = useStage((s) => s.delta)
  if (!def?.drama.cast.includes('kouhai')) return null
  const f = FACE[face.stage]
  const filled = Math.round(trust / 20)
  return (
    <div className="flex items-center gap-2" title={`${def.names.kouhai}の信頼 ${trust}/100`}>
      <span
        key={`${face.stage}`}
        className={`grid place-items-center rounded-full bg-sky-50 ${compact ? 'h-8 w-8 text-lg' : 'h-10 w-10 text-2xl'} ${face.direction === 'down' ? 'transition-opacity duration-1000' : 'stage-slide-in'}`}
        role="img"
        aria-label={`${def.names.kouhai}のまなざし：${f.label}`}
      >
        {f.icon}
      </span>
      <div className={`flex flex-col ${compact ? 'hidden' : ''}`}>
        <span className="text-[11px] text-slate-500">
          {def.names.kouhai}のまなざし：<span className="font-bold text-slate-800">{f.label}</span>
        </span>
        <span className="flex items-center gap-0.5" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className={`h-2.5 w-2.5 rounded-full ${i < filled ? 'bg-sky-500' : 'bg-slate-200'}`}
            />
          ))}
          {delta && delta.trust !== 0 && (
            <span
              key={delta.id}
              className={`stage-fade ml-1 text-[11px] font-bold ${delta.trust > 0 ? 'text-emerald-600' : 'text-rose-600'}`}
            >
              {delta.trust > 0 ? `+${delta.trust}` : delta.trust}
            </span>
          )}
        </span>
      </div>
    </div>
  )
}

function BossGauge({ compact = false }: { compact?: boolean }) {
  const def = useStage((s) => s.def)
  const mood = useStage((s) => s.mood)
  const value = useStage((s) => s.moodValue)
  const delta = useStage((s) => s.delta)
  if (!def?.drama.cast.includes('boss')) return null
  const m = MOOD[mood]
  return (
    <div className="flex items-center gap-2" title={`${def.names.boss}の機嫌 ${value}/100`}>
      <span
        className={`grid place-items-center rounded-full bg-slate-100 ${compact ? 'h-8 w-8 text-lg ring-2' : 'h-10 w-10 text-2xl ring-4'} ${m.ring} ${mood === 'boiling' ? 'stage-tremble' : ''}`}
        role="img"
        aria-label={`${def.names.boss}の機嫌：${m.label}`}
      >
        {m.icon}
      </span>
      <div className={`flex flex-col ${compact ? 'hidden' : ''}`}>
        <span className="text-[11px] text-slate-500">
          {def.names.boss}の機嫌：<span className="font-bold text-slate-800">{m.label}</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-20 overflow-hidden rounded bg-slate-200" aria-hidden>
            <span
              className="block h-full bg-amber-500 transition-all duration-500"
              style={{ width: `${value}%` }}
            />
          </span>
          {delta && delta.mood !== 0 && (
            <span
              key={delta.id}
              className={`stage-fade text-[11px] font-bold ${delta.mood > 0 ? 'text-emerald-600' : 'text-rose-600'}`}
            >
              {delta.mood > 0 ? `+${delta.mood}` : delta.mood}
            </span>
          )}
        </span>
      </div>
    </div>
  )
}

const STATUS_TONE = {
  normal: 'border-slate-200 bg-slate-50 text-slate-700',
  warn: 'border-amber-300 bg-amber-50 text-amber-800',
  danger: 'border-rose-300 bg-rose-50 text-rose-800',
}

/** ステージごとの数（待機室の人数、問い合わせの件数、損害額 など） */
function StatusChips() {
  const def = useStage((s) => s.def)
  const session = useStage((s) => s.session)
  const at = useStage((s) => s.at)
  if (!def?.status || !session) return null
  const items = def.status(session.world, session.progress, gameSecOf(def, session, at))
  if (items.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((s) => (
        <span
          key={s.label}
          className={`rounded border px-2 py-1 text-[11px] ${STATUS_TONE[s.tone ?? 'normal']}`}
        >
          {s.label} <span className="font-bold tabular-nums">{s.value}</span>
        </span>
      ))}
    </div>
  )
}

export function StageHeader({
  onExit,
  compact = false,
}: {
  onExit: () => void
  compact?: boolean
}) {
  const def = useStage((s) => s.def)
  const reports = useStage((s) => s.reports)
  const phase = useStage((s) => s.phase)
  const hint = useStage((s) => s.hint)
  const showReport = useStage((s) => s.showReport)
  const restart = useStage((s) => s.restart)
  const resetWorld = useStage((s) => s.resetWorld)
  if (!def) return null
  const hintMin = Math.round((def.hintSec ?? 300) / 60)
  const confirmRestart = () => {
    if (
      window.confirm(
        '最初からやり直します。リポジトリ、時計、始末書、ゲージはすべて最初の状態に戻ります。よろしいですか？',
      )
    )
      restart()
  }
  const reportButton = reports.length > 0 && (
    <button
      type="button"
      onClick={() => showReport(reports.at(-1)?.kind ?? null)}
      className="rounded border border-rose-300 bg-rose-50 px-2 py-1 text-xs text-rose-800 hover:bg-rose-100"
    >
      始末書 {reports.length}
    </button>
  )

  if (compact) {
    // スマホ：1行に、しごと・時計・顔2つ・始末書・≡（docs/08 の 9.2）
    return (
      <header className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-1.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold">{def.mission.task}</p>
          <p className="truncate text-[10px] text-slate-500">〆 {def.mission.due}</p>
        </div>
        <Clock compact />
        <KouhaiGauge compact />
        <BossGauge compact />
        {reportButton}
        <details className="relative">
          <summary
            className="grid h-8 w-8 cursor-pointer list-none place-items-center rounded border border-slate-300 text-base"
            aria-label="メニュー"
          >
            ≡
          </summary>
          <div className="absolute top-9 right-0 z-30 flex w-48 flex-col gap-1 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
            <button
              type="button"
              onClick={hint}
              disabled={phase !== 'playing'}
              className="rounded bg-violet-600 px-3 py-2 text-left text-xs font-bold text-white disabled:bg-slate-300"
            >
              早瀬先輩に聞く（−{hintMin}分）
            </button>
            {def.resetWorld && (
              <button
                type="button"
                onClick={resetWorld}
                disabled={phase !== 'playing'}
                className="rounded border border-violet-300 px-3 py-2 text-left text-xs text-violet-700 disabled:opacity-50"
              >
                {def.resetWorld.label}
              </button>
            )}
            <button
              type="button"
              onClick={confirmRestart}
              className="rounded border border-slate-300 px-3 py-2 text-left text-xs text-slate-600"
            >
              やり直す
            </button>
            <button
              type="button"
              onClick={onExit}
              className="rounded border border-slate-300 px-3 py-2 text-left text-xs text-slate-600"
            >
              メニューへ
            </button>
          </div>
        </details>
      </header>
    )
  }

  return (
    <header className="flex items-center gap-5 border-b border-slate-200 bg-white px-4 py-2">
      <div className="min-w-0">
        <p className="text-[10px] font-bold text-slate-400">今日のしごと</p>
        <p className="truncate text-sm font-bold">{def.mission.task}</p>
        <p className="truncate text-[11px] text-slate-500">{def.title}</p>
      </div>
      <Clock />
      <KouhaiGauge />
      <BossGauge />
      <StatusChips />
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {reportButton}
        {def.resetWorld && (
          <button
            type="button"
            onClick={resetWorld}
            disabled={phase !== 'playing'}
            title="リポジトリだけを最初の状態に戻します。始末書と損害額は残ります"
            className="rounded border border-violet-300 px-3 py-1 text-xs text-violet-700 hover:bg-violet-50 disabled:opacity-50"
          >
            {def.resetWorld.label}
          </button>
        )}
        <button
          type="button"
          onClick={hint}
          disabled={phase !== 'playing'}
          title={`先輩が次の一手を教えてくれます。作中の時計が${hintMin}分進みます`}
          className="rounded bg-violet-600 px-3 py-1 text-xs text-white hover:bg-violet-700 disabled:bg-slate-300"
        >
          ヒント（−{hintMin}分）
        </button>
        <button
          type="button"
          onClick={confirmRestart}
          title="ステージを最初からやり直します"
          className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
        >
          やり直す
        </button>
        <button
          type="button"
          onClick={onExit}
          className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
        >
          メニューへ
        </button>
      </div>
    </header>
  )
}
