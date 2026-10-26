import { type FormEvent, useState } from 'react'
import type { FileState } from '../../../engine/index.ts'
import { useFreeMode } from '../../store/freeMode.ts'

const MARK: Record<
  FileState['worktree'],
  { text: string; className: string; title: string } | null
> = {
  clean: null,
  conflicted: {
    text: '!',
    className: 'text-rose-600',
    title: 'コンフリクト中（印を直して git add すると解消）',
  },
  untracked: {
    text: 'U',
    className: 'text-emerald-600',
    title: '未追跡（まだgitが管理していない）',
  },
  modified: { text: 'M', className: 'text-amber-600', title: '変更あり（まだステージしていない）' },
  deleted: { text: 'D', className: 'text-rose-600', title: '削除した（まだステージしていない）' },
}

export function FilePanel({ files, folder }: { files: FileState[]; folder: string }) {
  const selected = useFreeMode((s) => s.selectedFile)
  const select = useFreeMode((s) => s.selectFile)
  const createFile = useFreeMode((s) => s.createFile)
  const removeFile = useFreeMode((s) => s.removeFile)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const path = name.trim().replace(/^\.?\/+/, '')
    if (
      path === '' ||
      path.endsWith('/') ||
      path.split('/').some((p) => p === '' || p === '..' || p === '.git')
    ) {
      setError('ファイル名を入力してください（例 src/util.js）')
      return
    }
    const problem = createFile(path)
    if (problem) {
      setError(problem)
      return
    }
    setCreating(false)
    setName('')
    setError('')
  }

  // 作業ツリーから消えたファイルも、git がまだ覚えているあいだは取り消し線で表示する
  const isGone = (f: FileState) =>
    f.worktree === 'deleted' || (f.staged === 'D' && f.worktree === 'clean')

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <h2 className="min-w-0 truncate text-xs font-bold text-slate-700" title={folder}>
          ファイル <span className="font-mono font-normal text-slate-400">{folder}</span>
        </h2>
        <button
          type="button"
          onClick={() => {
            setCreating((v) => !v)
            setError('')
          }}
          className="rounded px-2 py-0.5 text-xs text-sky-700 hover:bg-sky-50"
        >
          ＋ 新規ファイル
        </button>
      </div>
      {creating && (
        <form onSubmit={submit} className="border-b border-slate-200 px-3 py-2">
          <input
            // biome-ignore lint/a11y/noAutofocus: 「新規ファイル」を押した直後に名前を打てるようにする
            autoFocus
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError('')
            }}
            placeholder="src/util.js"
            aria-label="新しいファイルの名前"
            className="w-full rounded border border-slate-300 px-2 py-1 font-mono text-xs outline-none focus:border-sky-500"
          />
          {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
        </form>
      )}
      {files.length === 0 && (
        <p className="px-3 py-2 text-xs text-slate-400">
          このフォルダにはファイルがありません（ls で中身、cd で移動）
        </p>
      )}
      <ul className="min-h-0 flex-1 overflow-y-auto py-1">
        {files.map((f) => {
          const mark = MARK[f.worktree]
          const isSelected = f.path === selected
          const gone = isGone(f)
          return (
            <li key={f.path} className="group flex items-center">
              <button
                type="button"
                onClick={() => select(f.path)}
                className={`flex min-w-0 flex-1 items-center gap-2 px-3 py-0.5 text-left font-mono text-xs ${
                  isSelected ? 'bg-sky-100 text-sky-900' : 'text-slate-700 hover:bg-slate-100'
                } ${gone ? 'line-through opacity-60' : ''}`}
              >
                <span className="truncate">{f.path}</span>
                {f.staged && (
                  <span className="text-[10px] text-sky-600" title="ステージ済みの変更あり">
                    ●
                  </span>
                )}
                {mark && (
                  <span className={`ml-auto font-bold ${mark.className}`} title={mark.title}>
                    {mark.text}
                  </span>
                )}
              </button>
              {!gone && (
                <button
                  type="button"
                  onClick={() => removeFile(f.path)}
                  aria-label={`${f.path} を削除`}
                  title="作業ツリーから削除（rm と同じ）"
                  className="px-2 text-xs text-slate-300 opacity-0 hover:text-rose-600 group-hover:opacity-100 focus:opacity-100"
                >
                  ✕
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
