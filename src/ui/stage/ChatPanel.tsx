// Slack 風のチャット（docs/03 §2.2）。部長・後輩・先輩のセリフが流れる。
import { useEffect, useRef } from 'react'
import type { Character } from '../../drama/index.ts'
import { useStage } from '../store/stage.ts'

const AVATAR: Record<Character, { icon: string; className: string }> = {
  boss: { icon: '部', className: 'bg-slate-800 text-white' },
  kouhai: { icon: '田', className: 'bg-sky-500 text-white' },
  senpai: { icon: '早', className: 'bg-violet-500 text-white' },
}

export function ChatPanel() {
  const def = useStage((s) => s.def)
  const chat = useStage((s) => s.chat)
  const typing = useStage((s) => s.typing)
  const bottom = useRef<HTMLDivElement>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: 新しい発言が来たら下まで送る
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [chat.length, typing])

  if (!def) return null
  return (
    <div className="flex h-full min-h-0 flex-col">
      <h2 className="border-b border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">
        # dev
      </h2>
      <ol className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3" aria-live="polite">
        {chat.map((m) => (
          <li key={m.id} className="stage-slide-in flex gap-2">
            <span
              className={`grid h-7 w-7 shrink-0 place-items-center rounded text-xs font-bold ${AVATAR[m.from].className}`}
              aria-hidden
            >
              {AVATAR[m.from].icon}
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-slate-700">{def.names[m.from]}</p>
              <p
                className={`whitespace-pre-wrap break-words text-xs ${
                  m.style === 'rage'
                    ? 'rounded bg-rose-100 px-1.5 py-0.5 font-bold text-rose-900'
                    : m.style === 'whisper'
                      ? 'italic text-slate-500'
                      : 'text-slate-800'
                }`}
              >
                {m.text}
              </p>
            </div>
          </li>
        ))}
        {typing && <li className="text-[11px] text-slate-400">{def.names[typing.who]}が入力中…</li>}
        <div ref={bottom} />
      </ol>
    </div>
  )
}
