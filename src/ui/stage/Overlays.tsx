// ステージの上に重ねるもの：導入、カットイン、始末書、結果、雷、push の動き。
import { useEffect, useMemo, useState } from 'react'
import { clockText, type DangerKind } from '../../drama/index.ts'
import type { StageProgress } from '../../scenarios/stage.ts'
import { now } from '../store/freeMode.ts'
import { useStage } from '../store/stage.ts'

const EMPTY_PROGRESS: StageProgress = {
  milestones: [],
  said: [],
  flags: [],
  choices: [],
  fired: [],
  memo: {},
}

import { FACE, MOOD } from './StageHeader.tsx'

const CUTIN_TEXT = {
  rage: { mark: '怒', className: 'bg-rose-700 text-white' },
  sparkle: { mark: '✨', className: 'bg-sky-400 text-white' },
  despair: { mark: '…', className: 'bg-slate-700 text-slate-100' },
  thunder: { mark: '⚡', className: 'bg-yellow-300 text-slate-900' },
}

export function IntroModal() {
  const def = useStage((s) => s.def)
  const start = useStage((s) => s.start)
  const [untimed, setUntimed] = useState(false)
  // ゴールの文言だけ使う（達成の印は、遊び始めてから画面の右上に出す）
  const goals = useMemo(
    () => (def ? def.goals(def.buildWorld(now()), EMPTY_PROGRESS, []) : []),
    [def],
  )
  if (!def) return null
  return (
    <div className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-slate-900/60 p-4">
      <div className="stage-slide-in w-full max-w-xl rounded-lg bg-white p-6 shadow-xl">
        <p className="text-xs font-bold text-slate-400">ストーリー</p>
        <h2 className="mt-1 text-xl font-bold">{def.title}</h2>
        <ol className="mt-4 space-y-1.5">
          {def.intro.map((m) => (
            <li key={m.text} className="text-sm">
              <span className="font-bold">{def.names[m.from]}</span>「{m.text}」
            </li>
          ))}
        </ol>
        <h3 className="mt-5 text-[11px] font-bold text-slate-500">いまの状況</h3>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
          {def.situation.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <div className="mt-5 rounded border border-amber-300 bg-amber-50 p-3">
          <p className="text-[11px] font-bold text-amber-700">
            ゴール（{def.mission.due} までに、{goals.length}つともそろえばクリア）
          </p>
          <ul className="mt-1 space-y-1">
            {goals.map((g) => (
              <li key={g.text} className="flex gap-2 text-sm font-bold">
                <span aria-hidden>☐</span>
                {g.text}
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-4 text-xs text-slate-500">
          下のターミナルに git のコマンドを打って進めます。ファイルは左の一覧とエディタで直せます。
          ゴールは画面の右上に出ていて、達成するとチェックがつきます。手数が少ないほど、後輩のまなざしは輝きます。
        </p>
        <label className="mt-4 flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={untimed} onChange={(e) => setUntimed(e.target.checked)} />
          時間制限なしで遊ぶ（時計は進みますが、締切で怒られません）
        </label>
        <button
          type="button"
          onClick={() => start(untimed)}
          className="mt-5 w-full rounded bg-slate-900 py-2 text-sm font-bold text-white hover:bg-slate-700"
        >
          始める
        </button>
      </div>
    </div>
  )
}

/** 画面を横切る帯。雷のときは全画面を光らせる */
export function CutInOverlay() {
  const def = useStage((s) => s.def)
  const cutin = useStage((s) => s.cutin)
  const chat = useStage((s) => s.chat)
  const dismiss = useStage((s) => s.dismissCutin)

  useEffect(() => {
    if (!cutin) return
    const timer = setTimeout(dismiss, cutin.variant === 'thunder' ? 2200 : 1600)
    return () => clearTimeout(timer)
  }, [cutin, dismiss])

  if (!def || !cutin) return null
  const said = [...chat].reverse().find((m) => m.from === cutin.who)?.text ?? ''
  const t = CUTIN_TEXT[cutin.variant]
  if (cutin.variant === 'thunder') {
    return (
      <button
        type="button"
        onClick={dismiss}
        className="stage-flash fixed inset-0 z-50 grid place-items-center text-center"
      >
        <span>
          <span className="block text-8xl" aria-hidden>
            ⚡
          </span>
          <span className="mt-4 block text-3xl font-black text-white">{def.names[cutin.who]}</span>
          <span className="mt-2 block text-xl font-bold text-yellow-200">{said}</span>
        </span>
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={dismiss}
      className="pointer-events-auto fixed inset-x-0 top-1/3 z-50 overflow-hidden"
    >
      <div className={`stage-cutin flex items-center gap-6 px-12 py-5 shadow-2xl ${t.className}`}>
        <span className="text-5xl font-black" aria-hidden>
          {t.mark}
        </span>
        <span className="text-left">
          <span className="block text-sm font-bold opacity-80">{def.names[cutin.who]}</span>
          <span className="block text-2xl font-black">{said}</span>
        </span>
      </div>
    </button>
  )
}

const LEVEL_CLASS = [
  '',
  'bg-slate-500',
  'bg-amber-500',
  'bg-orange-600',
  'bg-rose-600',
  'bg-rose-900',
]

/** 始末書（docs/04 §5、ヤバ度は docs/06 の 2.1） */
export function ReportModal() {
  const def = useStage((s) => s.def)
  const open = useStage((s) => s.openReport)
  const cutin = useStage((s) => s.cutin)
  const reports = useStage((s) => s.reports)
  const checkpoint = useStage((s) => s.session?.checkpoint ?? null)
  const showReport = useStage((s) => s.showReport)
  const rollback = useStage((s) => s.rollback)
  if (!def || !open || cutin) return null
  const text = def.reports[open]
  const level = reports.find((r) => r.kind === open)?.level ?? 1
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/50 p-4">
      <article className="stage-slide-in max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-sm border-t-8 border-rose-700 bg-[#fffdf7] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-widest text-rose-700">始 末 書</p>
            <h2 className="mt-1 text-lg font-bold">{text?.title ?? open}</h2>
          </div>
          <span
            className={`shrink-0 rounded px-2 py-1 text-xs font-bold text-white ${LEVEL_CLASS[level]}`}
          >
            ヤバ度 Lv{level}
          </span>
        </div>
        {text ? (
          <dl className="mt-4 space-y-3 text-sm">
            <Section label="何をしたか">{text.what}</Section>
            <Section label="なぜまずいか">{text.why}</Section>
            <Section label="直し方">{text.howToFix}</Section>
            <Section label="次からは">{text.prevention}</Section>
            {text.cost && <Section label="損害額の内訳">{text.cost}</Section>}
          </dl>
        ) : (
          <p className="mt-4 text-sm">{open}</p>
        )}
        {text && (
          <p className="mt-4 border-l-4 border-slate-800 pl-3 text-sm font-bold">
            {def.names.boss}「{text.bossWord}」
          </p>
        )}
        {reports.length > 1 && (
          <div className="mt-4 flex flex-wrap gap-1">
            {reports.map((r) => (
              <button
                key={r.kind}
                type="button"
                onClick={() => showReport(r.kind as DangerKind)}
                className={`rounded border px-2 py-0.5 text-[11px] ${r.kind === open ? 'border-rose-400 bg-rose-50' : 'border-slate-300'}`}
              >
                {def.reports[r.kind]?.title ?? r.kind}
              </button>
            ))}
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          {checkpoint && (
            <button
              type="button"
              onClick={rollback}
              className="rounded bg-violet-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-700"
            >
              チェックポイント（push の前）に戻る
            </button>
          )}
          <button
            type="button"
            onClick={() => showReport(null)}
            className="rounded border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50"
          >
            {checkpoint ? 'このまま続ける' : '閉じる'}
          </button>
        </div>
      </article>
    </div>
  )
}

function Section({ label, children }: { label: string; children: string }) {
  return (
    <div>
      <dt className="text-[11px] font-bold text-slate-500">{label}</dt>
      <dd className="mt-0.5 leading-relaxed">{children}</dd>
    </div>
  )
}

const RANK_CLASS = {
  S: 'border-amber-500 text-amber-500',
  A: 'border-rose-600 text-rose-600',
  B: 'border-sky-600 text-sky-600',
  C: 'border-slate-500 text-slate-500',
  D: 'border-slate-400 text-slate-400',
}

/** 結果。エンディングのセリフを読めるよう、少し待ってから出す */
export function ResultPanel({ onRetry, onExit }: { onRetry: () => void; onExit: () => void }) {
  const def = useStage((s) => s.def)
  const rank = useStage((s) => s.rank)
  const session = useStage((s) => s.session)
  const reports = useStage((s) => s.reports)
  const face = useStage((s) => s.face)
  const mood = useStage((s) => s.mood)
  const at = useStage((s) => s.at)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!rank) {
      setVisible(false)
      return
    }
    const timer = setTimeout(() => setVisible(true), 2500)
    return () => clearTimeout(timer)
  }, [rank])

  if (!def || !rank || !session || !visible) return null
  const drama = session.drama
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/60 p-4">
      <div className="stage-slide-in w-full max-w-md rounded-lg bg-white p-6 text-center shadow-xl">
        <p className="text-xs font-bold text-slate-400">{def.title}</p>
        <p className="mt-1 text-lg font-bold">{session.cleared ? 'クリア' : '終了'}</p>
        <div
          className={`stage-stamp mx-auto mt-4 grid h-28 w-28 place-items-center rounded-full border-8 text-6xl font-black ${RANK_CLASS[rank.rank]}`}
        >
          {rank.rank}
        </div>
        <dl className="mx-auto mt-5 grid max-w-xs grid-cols-2 gap-y-1 text-left text-sm">
          <dt className="text-slate-500">完了時刻</dt>
          <dd className="font-mono">
            {clockText(def.drama, at, drama.extraClockSec)}（締切 {def.mission.due}）
          </dd>
          <dt className="text-slate-500">手数</dt>
          <dd>
            {drama.moves} 手（最短 {def.drama.par} 手）
          </dd>
          <dt className="text-slate-500">始末書</dt>
          <dd>{reports.length === 0 ? 'なし' : `${reports.length} 枚`}</dd>
          <dt className="text-slate-500">{def.names.kouhai}</dt>
          <dd>
            {FACE[face.stage].icon} {FACE[face.stage].label}
          </dd>
          <dt className="text-slate-500">{def.names.boss}</dt>
          <dd>
            {MOOD[mood].icon} {MOOD[mood].label}
          </dd>
        </dl>
        {rank.slow && <p className="mt-2 text-xs text-slate-500">（時間制限なしで遊んだ記録）</p>}
        <div className="mt-6 flex justify-center gap-2">
          <button
            type="button"
            onClick={onRetry}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700"
          >
            もう一度
          </button>
          <button
            type="button"
            onClick={onExit}
            className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            メニューへ
          </button>
        </div>
      </div>
    </div>
  )
}

/** 雷が落ちた（実戦型）。チェックポイントか最初からやり直す（docs/04 §4.1） */
export function ThunderModal({ onRetry }: { onRetry: () => void }) {
  const def = useStage((s) => s.def)
  const thunder = useStage((s) => s.thunder)
  const cutin = useStage((s) => s.cutin)
  const open = useStage((s) => s.openReport)
  const phase = useStage((s) => s.phase)
  const checkpoint = useStage((s) => s.session?.checkpoint ?? null)
  const rollback = useStage((s) => s.rollback)
  const [dismissed, setDismissed] = useState(false)
  if (!def || !thunder || cutin || open || phase !== 'playing' || dismissed) return null
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/70 p-4">
      <div className="stage-slide-in w-full max-w-sm rounded-lg bg-white p-6 text-center shadow-xl">
        <p className="text-5xl" aria-hidden>
          ⚡
        </p>
        <p className="mt-2 text-lg font-bold">{def.names.boss}の雷が落ちた</p>
        <p className="mt-1 text-xs text-slate-500">やり直して、もう一度挑戦しましょう</p>
        <div className="mt-5 flex flex-col gap-2">
          {checkpoint && (
            <button
              type="button"
              onClick={rollback}
              className="rounded bg-violet-600 py-2 text-sm font-bold text-white"
            >
              チェックポイントに戻る
            </button>
          )}
          <button
            type="button"
            onClick={onRetry}
            className="rounded bg-slate-900 py-2 text-sm font-bold text-white"
          >
            最初からやり直す
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="text-xs text-slate-500 underline"
          >
            このまま続ける
          </button>
        </div>
      </div>
    </div>
  )
}

/** push が弾かれた／押し切った／届いた、をコミットグラフの上で見せる */
export function PushEffect() {
  const effect = useStage((s) => s.effect)
  if (!effect) return null
  if (effect.kind === 'rejected') {
    return (
      <div
        key={effect.id}
        className="stage-bounce pointer-events-none absolute top-4 left-1/2 z-10 -translate-x-1/2 rounded-full border-2 border-rose-400 bg-white px-4 py-2 text-sm font-bold text-rose-700 shadow"
      >
        ↩ push が弾かれた
        <span className="block text-[11px] font-normal text-slate-500">
          {effect.reason === 'fetch-first'
            ? 'origin に、手元にないコミットがある'
            : '手元の履歴が origin より古い'}
        </span>
      </div>
    )
  }
  if (effect.kind === 'forced') {
    return (
      <div
        key={effect.id}
        className="pointer-events-none absolute top-6 left-1/2 z-10 -translate-x-1/2 text-center"
      >
        <span className="stage-fly inline-block text-4xl" aria-hidden>
          ⚾
        </span>
        <span className="stage-fade block rounded bg-rose-700 px-3 py-1 text-sm font-bold text-white">
          origin から {effect.lost} 件のコミットが消えた
        </span>
      </div>
    )
  }
  return (
    <div
      key={effect.id}
      className="stage-fade pointer-events-none absolute top-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow"
    >
      ✓ origin に届いた
    </div>
  )
}
