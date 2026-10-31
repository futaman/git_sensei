// スマホの画面（docs/08 の 9.2）。上に帯、真ん中に選んだタブ、下にタブの切り替え。
// タブの中身は切り替えても消さない（組み立て中のコマンドや、エディタの位置を保つため）。
import type { ReactNode } from 'react'

export interface MobileTab {
  key: string
  label: string
  content: ReactNode
  /** 見ていないあいだに新しいものが来た */
  badge?: boolean
}

export function MobileShell({
  header,
  tabs,
  active,
  onSelect,
  className = '',
}: {
  header: ReactNode
  tabs: MobileTab[]
  active: string
  onSelect: (key: string) => void
  className?: string
}) {
  return (
    <div
      className={`grid h-dvh w-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-slate-100 text-slate-900 ${className}`}
    >
      {header}
      <div className="relative min-h-0">
        {tabs.map((t) => (
          <section
            key={t.key}
            hidden={t.key !== active}
            className="absolute inset-0 grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] overflow-hidden"
          >
            {t.content}
          </section>
        ))}
      </div>
      <nav className="grid grid-cols-4 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onSelect(t.key)}
            aria-current={t.key === active ? 'page' : undefined}
            className={`relative py-2 text-xs font-bold ${
              t.key === active ? 'text-slate-900' : 'text-slate-400'
            }`}
          >
            {t.label}
            {t.badge && t.key !== active && (
              <span
                className="absolute top-1.5 ml-1 inline-block h-2 w-2 rounded-full bg-rose-500"
                role="img"
                aria-label="新しいものがあります"
              />
            )}
            {t.key === active && (
              <span
                className="absolute inset-x-6 bottom-0 h-0.5 rounded bg-slate-900"
                aria-hidden
              />
            )}
          </button>
        ))}
      </nav>
    </div>
  )
}
