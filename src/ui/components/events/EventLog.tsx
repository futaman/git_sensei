import { useFreeMode } from '../../store/freeMode.ts'
import { describeEvent, type Tone } from './describe.ts'

const TONE: Record<Tone, string> = {
  normal: 'border-slate-200 bg-white text-slate-700',
  good: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  warn: 'border-amber-200 bg-amber-50 text-amber-900',
  danger: 'border-rose-200 bg-rose-50 text-rose-900',
}

export function EventLog() {
  const events = useFreeMode((s) => s.events)
  return (
    <div className="flex h-full min-h-0 flex-col">
      <h2 className="border-b border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">
        できごと
      </h2>
      <ol className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {events.length === 0 && (
          <li className="text-xs text-slate-400">
            gitコマンドを実行すると、ここに何が起きたかが出ます
          </li>
        )}
        {[...events].reverse().map(({ id, event, command }) => {
          const { text, tone } = describeEvent(event)
          return (
            <li key={id} className={`rounded border px-2 py-1.5 text-xs ${TONE[tone]}`}>
              <p>{text}</p>
              <p className="mt-0.5 truncate font-mono text-[10px] opacity-60">$ {command}</p>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
