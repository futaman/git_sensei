// ゴールの一覧。origin の状態から、達成したものにその場でチェックがつく。
import { useMemo } from 'react'
import { useStage } from '../store/stage.ts'

export function GoalPanel() {
  const def = useStage((s) => s.def)
  const session = useStage((s) => s.session)
  const goals = useMemo(
    () => (def && session ? def.goals(session.world, session.progress, session.drama.reports) : []),
    [def, session],
  )
  if (!def || goals.length === 0) return null
  const all = goals.every((g) => g.done)
  return (
    <section
      className={`border-b px-3 py-2 ${all ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}
    >
      <h2 className={`text-[11px] font-bold ${all ? 'text-emerald-700' : 'text-amber-700'}`}>
        ゴール（{def.drama.deadlineSec !== undefined ? `${def.mission.due} までに、` : ''}ぜんぶ ✓
        でクリア）
      </h2>
      <ul className="mt-1 space-y-1">
        {goals.map((g) => (
          <li
            key={g.text}
            className={`flex gap-1.5 text-xs ${g.done ? 'text-emerald-800' : 'font-bold text-slate-900'}`}
          >
            <span
              className={`mt-px grid h-3.5 w-3.5 shrink-0 place-items-center rounded-sm border text-[10px] leading-none ${g.done ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-400 bg-white'}`}
              role="img"
              aria-label={g.done ? '達成' : '未達成'}
            >
              {g.done ? '✓' : ''}
            </span>
            {g.text}
          </li>
        ))}
      </ul>
    </section>
  )
}
