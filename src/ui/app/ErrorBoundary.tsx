// 描画中の例外を受け止める。受け止めないと画面全体が消え、壊れた状態が保存されたままになると
// リロードしても開けなくなる（検証レポート B2）。保存データを消してやり直す道を必ず残す。
import { Component, type ReactNode } from 'react'
import { safeStorage } from '../storage.ts'
import { STORAGE_KEY } from '../store/freeMode.ts'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  componentDidCatch(error: unknown) {
    console.error('git-sensei: 表示中にエラーが起きました', error)
  }

  private resetAndReload = () => {
    safeStorage.removeItem(STORAGE_KEY)
    window.location.reload()
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6 text-slate-900">
        <div
          role="alert"
          className="max-w-md rounded border border-rose-200 bg-white p-6 shadow-sm"
        >
          <h1 className="text-base font-bold">表示中にエラーが起きました</h1>
          <p className="mt-2 text-sm text-slate-600">
            保存されているデータが原因かもしれません。保存データを消すと、最初の状態からやり直せます。
          </p>
          <pre className="mt-3 overflow-x-auto rounded bg-slate-50 p-2 text-xs text-slate-500">
            {error.message}
          </pre>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={this.resetAndReload}
              className="rounded bg-rose-600 px-3 py-1.5 text-sm text-white hover:bg-rose-700"
            >
              保存データを消してやり直す
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            >
              再読み込み
            </button>
          </div>
        </div>
      </div>
    )
  }
}
