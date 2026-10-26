// コンフリクトの印（<<<<<<< / ======= / >>>>>>>）と、自分側・相手側の行に色を付ける。
import { RangeSetBuilder } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view'

const marker = Decoration.line({ class: 'cm-conflict-marker' })
const ours = Decoration.line({ class: 'cm-conflict-ours' })
const theirs = Decoration.line({ class: 'cm-conflict-theirs' })

function build(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  let section: 'none' | 'ours' | 'theirs' = 'none'
  const doc = view.state.doc
  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n)
    const text = line.text
    if (text.startsWith('<<<<<<<')) {
      builder.add(line.from, line.from, marker)
      section = 'ours'
    } else if (text.startsWith('=======') && section === 'ours') {
      builder.add(line.from, line.from, marker)
      section = 'theirs'
    } else if (text.startsWith('>>>>>>>') && section === 'theirs') {
      builder.add(line.from, line.from, marker)
      section = 'none'
    } else if (section !== 'none') {
      builder.add(line.from, line.from, section === 'ours' ? ours : theirs)
    }
  }
  return builder.finish()
}

export const conflictHighlight = [
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = build(view)
      }
      update(u: ViewUpdate) {
        if (u.docChanged) this.decorations = build(u.view)
      }
    },
    { decorations: (v) => v.decorations },
  ),
  EditorView.baseTheme({
    '.cm-conflict-marker': { backgroundColor: '#fecdd3', fontWeight: 'bold' },
    '.cm-conflict-ours': { backgroundColor: '#dcfce7' },
    '.cm-conflict-theirs': { backgroundColor: '#e0f2fe' },
  }),
]
