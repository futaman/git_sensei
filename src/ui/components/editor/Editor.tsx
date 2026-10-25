// CodeMirror のエディタ。作業ツリーのファイルを直接書き換える。
// git switch などで外からファイルが変わったときは、表示中の内容を差し替える。
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import { useEffect, useRef } from 'react'

interface Props {
  path: string
  content: string
  onChange: (content: string) => void
}

export function Editor({ path, content, onChange }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // ファイルを開き直すたびに作り直す（取り消し履歴もファイルごとに分かれる）
  // biome-ignore lint/correctness/useExhaustiveDependencies: content の変化は下の effect で反映する
  useEffect(() => {
    if (!host.current) return
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: content,
        extensions: [
          basicSetup,
          EditorView.lineWrapping,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString())
          }),
          EditorView.theme({
            '&': { height: '100%', fontSize: '13px' },
            '.cm-scroller': { fontFamily: 'var(--font-mono)' },
          }),
        ],
      }),
    })
    view.current = v
    return () => {
      v.destroy()
      view.current = null
    }
  }, [path])

  useEffect(() => {
    const v = view.current
    if (!v) return
    const current = v.state.doc.toString()
    if (current !== content) {
      v.dispatch({ changes: { from: 0, to: current.length, insert: content } })
    }
  }, [content])

  return <div ref={host} className="h-full min-h-0 overflow-hidden" />
}
