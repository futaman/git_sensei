// 最初の画面：ストーリーのステージか、フリーモードかを選ぶ。
import type { StageDefinition } from '../../scenarios/stage.ts'

export function MenuScreen({
  stages,
  onStage,
  onFree,
}: {
  stages: StageDefinition[]
  onStage: (def: StageDefinition) => void
  onFree: () => void
}) {
  return (
    <div className="min-h-screen bg-slate-100 px-4 py-12 text-slate-900">
      <div className="mx-auto max-w-2xl">
        <h1 className="font-mono text-3xl font-bold">git_sensei</h1>
        <p className="mt-2 text-sm text-slate-600">
          頑固な部長と、まっすぐな後輩のいる職場で、git を体で覚える。
        </p>

        <h2 className="mt-10 text-xs font-bold text-slate-500">ストーリー</h2>
        <ul className="mt-2 space-y-3">
          {stages.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onStage(s)}
                className="w-full rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-slate-400"
              >
                <p className="text-lg font-bold">{s.title}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {s.mission.task}（締切 {s.mission.due}）
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  {s.names.boss}・{s.names.kouhai}・{s.names.senpai}
                </p>
              </button>
            </li>
          ))}
        </ul>

        <h2 className="mt-10 text-xs font-bold text-slate-500">練習</h2>
        <button
          type="button"
          onClick={onFree}
          className="mt-2 w-full rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-slate-400"
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
