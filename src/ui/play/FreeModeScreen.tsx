// フリーモードの画面（docs/03 §2.2 の PC レイアウト。右側はチャットの代わりに「できごと」）
import { lazy, Suspense, useMemo } from 'react'
import { fileStates, repoView } from '../../engine/index.ts'
import { FourAreas } from '../components/areas/FourAreas.tsx'
import { EventLog } from '../components/events/EventLog.tsx'
import { FilePanel } from '../components/files/FilePanel.tsx'
import { CommitGraph } from '../components/graph/CommitGraph.tsx'
import { Terminal } from '../components/terminal/Terminal.tsx'
import { useFreeMode, WS } from '../store/freeMode.ts'

// CodeMirror は大きいので、最初の表示を待たせないよう後から読み込む
const Editor = lazy(() =>
  import('../components/editor/Editor.tsx').then((m) => ({ default: m.Editor })),
)

export function FreeModeScreen() {
  const world = useFreeMode((s) => s.world)
  const selected = useFreeMode((s) => s.selectedFile)
  const editFile = useFreeMode((s) => s.editFile)
  const reset = useFreeMode((s) => s.reset)

  const ws = world.workspaces[WS]
  const files = useMemo(() => (ws ? fileStates(ws) : []), [ws])
  const view = useMemo(() => (ws?.git ? repoView(ws.git) : null), [ws])
  const content = selected !== null ? ws?.files[selected] : undefined

  return (
    <div className="grid h-screen grid-rows-[auto_minmax(0,1fr)_minmax(200px,34vh)] bg-slate-100 text-slate-900">
      <header className="flex items-center gap-4 border-b border-slate-200 bg-white px-4 py-2">
        <h1 className="font-mono text-base font-bold">git_sensei</h1>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
          フリーモード
        </span>
        <span className="text-xs text-slate-400">シナリオなしで自由にgitを試せます</span>
        <button
          type="button"
          onClick={() => {
            if (
              window.confirm(
                '最初の状態に戻します。いまのリポジトリとファイルは消えます。よろしいですか？',
              )
            )
              reset()
          }}
          className="ml-auto rounded border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
        >
          最初からやり直す
        </button>
      </header>

      <div className="grid min-h-0 grid-cols-[260px_minmax(0,1fr)_280px]">
        <aside className="grid min-h-0 grid-rows-[minmax(0,40%)_minmax(0,1fr)] border-r border-slate-200 bg-white">
          <FilePanel files={files} />
          <div className="flex min-h-0 flex-col border-t border-slate-200">
            <div className="truncate border-b border-slate-200 px-3 py-1.5 font-mono text-xs text-slate-500">
              {selected ?? 'ファイルを選んでください'}
            </div>
            <div className="min-h-0 flex-1">
              {selected !== null && content !== undefined ? (
                <Suspense
                  fallback={<p className="p-3 text-xs text-slate-400">エディタを準備中…</p>}
                >
                  <Editor
                    path={selected}
                    content={content}
                    onChange={(c) => editFile(selected, c)}
                  />
                </Suspense>
              ) : (
                <p className="p-3 text-xs text-slate-400">
                  {selected !== null
                    ? 'このファイルは作業ツリーにありません'
                    : '左の一覧からファイルを選ぶと、ここで編集できます'}
                </p>
              )}
            </div>
          </div>
        </aside>

        <main className="grid min-h-0 grid-rows-[minmax(0,1fr)_minmax(150px,42%)]">
          <section className="min-h-0 bg-white">
            <h2 className="sr-only">コミットグラフ</h2>
            <CommitGraph view={view} />
          </section>
          <section className="min-h-0 border-t border-slate-200 bg-slate-50">
            <h2 className="sr-only">4つの領域</h2>
            <FourAreas hasRepo={!!ws?.git} files={files} view={view} />
          </section>
        </main>

        <aside className="min-h-0 border-l border-slate-200 bg-slate-50">
          <EventLog />
        </aside>
      </div>

      <Terminal />
    </div>
  )
}
