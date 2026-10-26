// エディタの欄（ファイル名、コンフリクトの「採用」ボタン、CodeMirror）。フリーモードとステージで共通。
import { lazy, Suspense } from 'react'
import { own } from '../../../engine/index.ts'
import { usePlay } from '../../play/PlayContext.tsx'
import { hasMarkers, resolveConflict } from './resolveConflict.ts'

// CodeMirror は大きいので、最初の表示を待たせないよう後から読み込む
const Editor = lazy(() => import('./Editor.tsx').then((m) => ({ default: m.Editor })))

export function EditorPane() {
  const { world, cwd, selectedFile: selected, editFile } = usePlay()
  const ws = own(world.workspaces, cwd)
  const raw = selected !== null && ws ? own(ws.files, selected) : undefined
  // 文字列以外を CodeMirror に渡すと、例外ではなく固まることがある（壊れた状態への備え）
  const content = typeof raw === 'string' ? raw : undefined
  const conflicted = content !== undefined && hasMarkers(content)

  return (
    <div className="flex min-h-0 flex-col border-t border-slate-200">
      <div className="truncate border-b border-slate-200 px-3 py-1.5 font-mono text-xs text-slate-500">
        {selected ?? 'ファイルを選んでください'}
      </div>
      {conflicted && selected !== null && (
        <div className="flex flex-wrap items-center gap-1 border-b border-rose-200 bg-rose-50 px-2 py-1">
          <span className="text-[11px] text-rose-800">コンフリクト：</span>
          <button
            type="button"
            onClick={() => editFile(selected, resolveConflict(content, 'ours'))}
            className="rounded border border-emerald-300 bg-white px-2 py-0.5 text-[11px] text-emerald-800 hover:bg-emerald-50"
            title="<<<<<<< HEAD から ======= までを残し、もう片方を消します"
          >
            自分の変更を採用
          </button>
          <button
            type="button"
            onClick={() => editFile(selected, resolveConflict(content, 'theirs'))}
            className="rounded border border-sky-300 bg-white px-2 py-0.5 text-[11px] text-sky-800 hover:bg-sky-50"
            title="======= から >>>>>>> までを残し、もう片方を消します"
          >
            取り込む変更を採用
          </button>
          <span className="text-[11px] text-rose-700">（手で直してもOK）</span>
        </div>
      )}
      <div className="min-h-0 flex-1">
        {selected !== null && content !== undefined ? (
          <Suspense fallback={<p className="p-3 text-xs text-slate-400">エディタを準備中…</p>}>
            <Editor
              key={cwd}
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
  )
}
