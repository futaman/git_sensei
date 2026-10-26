// 最初の画面：ストーリー（章ごとのステージ）か、フリーモードかを選ぶ。
import type { Chapter } from '../../scenarios/catalog.ts'
import type { StageDefinition } from '../../scenarios/stage.ts'
import { useRecords } from '../store/records.ts'

const RANK_CLASS: Record<string, string> = {
  S: 'border-amber-500 text-amber-600',
  A: 'border-rose-500 text-rose-600',
  B: 'border-sky-500 text-sky-600',
  C: 'border-slate-400 text-slate-500',
  D: 'border-slate-300 text-slate-400',
}

export function MenuScreen({
  chapters,
  onStage,
  onFree,
}: {
  chapters: Chapter[]
  onStage: (def: StageDefinition) => void
  onFree: () => void
}) {
  const best = useRecords((s) => s.best)
  return (
    <div className="min-h-screen bg-slate-100 px-4 py-12 text-slate-900">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-mono text-3xl font-bold">git_sensei</h1>
        <p className="mt-2 text-sm text-slate-600">
          頑固な部長と、まっすぐな後輩のいる職場で、git を体で覚える。
        </p>

        {chapters.map((chapter) => (
          <section key={chapter.title} className="mt-10">
            <h2 className="text-sm font-bold text-slate-700">{chapter.title}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{chapter.summary}</p>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {chapter.stages.map((s) => {
                const rank = Object.hasOwn(best, s.id) ? best[s.id] : undefined
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => onStage(s)}
                      className="flex h-full w-full flex-col rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-slate-400"
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span>
                          <span className="block text-[11px] font-bold text-slate-400">
                            {s.number}
                          </span>
                          <span className="block font-bold">{s.title}</span>
                        </span>
                        {rank && (
                          <span
                            className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 text-sm font-black ${RANK_CLASS[rank]}`}
                            title="いちばん良いランク"
                          >
                            {rank}
                          </span>
                        )}
                      </span>
                      <span className="mt-2 block text-xs text-slate-600">
                        {s.mission.task}（{s.mission.due}）
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}

        <h2 className="mt-10 text-sm font-bold text-slate-700">練習</h2>
        <button
          type="button"
          onClick={onFree}
          className="mt-3 w-full rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-slate-400"
        >
          <p className="font-bold">フリーモード</p>
          <p className="mt-1 text-sm text-slate-600">
            シナリオなしで、git のコマンドを自由に試せます。
          </p>
        </button>
      </div>
    </div>
  )
}
