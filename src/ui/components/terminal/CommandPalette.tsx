// コマンドを組み立てるパレット（docs/08 の 9章）。段ごとにボタンを横に並べる。
import type { PalettePart, PaletteSection } from './palette.ts'

export function CommandPalette({
  sections,
  onPick,
  emptyText,
}: {
  sections: PaletteSection[]
  onPick: (part: PalettePart) => void
  /** 候補がないときの一言（引用符の中、-c の後など） */
  emptyText?: string
}) {
  if (sections.length === 0) {
    return emptyText ? <p className="px-4 py-2 text-xs text-slate-500">{emptyText}</p> : null
  }
  return (
    <div className="flex flex-col gap-1 px-3 py-1.5">
      {sections.map((s) => (
        <div key={s.title} className="flex items-center gap-2">
          <span className="w-11 shrink-0 text-[11px] text-slate-400">{s.title}</span>
          <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
            {s.parts.map((p) => (
              <button
                key={p.text}
                type="button"
                title={p.help}
                onClick={() => onPick(p)}
                className={`shrink-0 rounded-full border px-3 py-1 font-mono text-xs leading-5 active:bg-slate-700 ${
                  p.danger
                    ? 'border-rose-400 text-rose-200 hover:bg-rose-900/40'
                    : 'border-slate-600 text-slate-100 hover:border-emerald-400 hover:text-emerald-300'
                }`}
              >
                {p.text.trim()}
                {p.text.endsWith(' ') && <span className="ml-1 text-slate-500">…</span>}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
