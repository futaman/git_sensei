import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { completionNames, fileStates, repoView, serverPaths } from '../../../engine/index.ts'
import { promptFor, type TerminalLine, useFreeMode } from '../../store/freeMode.ts'
import { suggestChips } from './chips.ts'
import { complete } from './completion.ts'

function lineClass(line: TerminalLine): string {
  switch (line.kind) {
    case 'input':
      return 'text-slate-100'
    case 'stdout':
      return 'text-slate-200'
    case 'stderr':
      return /^(fatal|error):/.test(line.text)
        ? 'text-red-400'
        : /^(hint|warning):/i.test(line.text)
          ? 'text-amber-300'
          : 'text-slate-300'
    case 'unsupported':
      return 'text-amber-300'
    case 'info':
      return 'text-sky-300'
    case 'npc':
      return 'text-violet-300'
  }
}

export function Terminal() {
  const lines = useFreeMode((s) => s.lines)
  const history = useFreeMode((s) => s.history)
  const world = useFreeMode((s) => s.world)
  const cwd = useFreeMode((s) => s.cwd)
  const run = useFreeMode((s) => s.run)

  const [input, setInput] = useState('')
  const [candidates, setCandidates] = useState<string[]>([])
  const historyIndex = useRef<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const ws = world.workspaces[cwd]
  const chips = useMemo(() => {
    if (!ws) return []
    const children = Object.values(world.workspaces)
      .filter((w) => w.git && !w.git.bare && w.path.startsWith(`${ws.path}/`))
      .map((w) => w.path.slice(ws.path.length + 1))
      .filter((rel) => !rel.includes('/'))
    return suggestChips({
      git: ws.git,
      files: fileStates(ws),
      view: ws.git && !ws.git.bare ? repoView(ws.git) : null,
      servers: serverPaths(world),
      clonedChildren: children,
    })
  }, [ws, world])

  // 出力や補完候補が増えたら最下部までスクロールする（依存は「増えた」きっかけとして使う）
  // biome-ignore lint/correctness/useExhaustiveDependencies: 上のとおり
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [lines, candidates])

  const submit = () => {
    run(input)
    setInput('')
    setCandidates([])
    historyIndex.current = null
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // 日本語入力の変換を確定する Enter では実行しない
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      if (!ws) return
      const r = complete(input, completionNames(ws))
      setInput(r.input)
      setCandidates(r.candidates)
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      if (history.length === 0) return
      const cur = historyIndex.current ?? history.length
      const next = e.key === 'ArrowUp' ? Math.max(cur - 1, 0) : cur + 1
      if (next >= history.length) {
        historyIndex.current = null
        setInput('')
      } else {
        historyIndex.current = next
        setInput(history[next] ?? '')
      }
    } else if (e.key === 'c' && e.ctrlKey && !window.getSelection()?.toString()) {
      e.preventDefault()
      setInput('')
      setCandidates([])
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault()
      run('clear')
    }
  }

  const applyChip = (command: string, cursorBack = 0) => {
    setInput(command)
    setCandidates([])
    // すぐ入力欄に戻す（ボタンにフォーカスが残ると、続けて押した Enter がボタンに行ってしまう）
    inputRef.current?.focus()
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      const pos = command.length - cursorBack
      el.setSelectionRange(pos, pos)
    })
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-slate-900 font-mono text-[13px] leading-relaxed">
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: クリックで入力欄にフォーカスするだけ。キーボードでは入力欄に直接入れる */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: 同上 */}
      <div
        className="min-h-0 flex-1 overflow-y-auto px-4 pt-3"
        onClick={() => {
          if (!window.getSelection()?.toString()) inputRef.current?.focus()
        }}
      >
        {lines.map((line) => (
          <div key={line.id} className={`whitespace-pre-wrap break-all ${lineClass(line)}`}>
            {line.kind === 'input' && <span className="mr-2 text-emerald-400">{line.prompt}</span>}
            {line.kind === 'unsupported' && <span className="mr-1">⚠</span>}
            {line.text || ' '}
          </div>
        ))}
        <div className="flex items-center">
          <label htmlFor="terminal-input" className="mr-2 shrink-0 text-emerald-400">
            {promptFor(world, cwd)}
          </label>
          <input
            id="terminal-input"
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              setCandidates([])
            }}
            onKeyDown={onKeyDown}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            // biome-ignore lint/a11y/noAutofocus: ターミナルを開いたらすぐ打てるようにする
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-slate-100 caret-emerald-400 outline-none"
          />
        </div>
        {candidates.length > 0 && <div className="text-slate-400">{candidates.join('  ')}</div>}
        <div ref={bottomRef} className="h-3" />
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-700 px-4 py-2 font-sans">
        <span className="text-xs text-slate-400">補助：</span>
        {chips.map((chip) => (
          <button
            key={chip.command}
            type="button"
            onClick={() => applyChip(chip.command, chip.cursorBack)}
            className="rounded border border-slate-600 px-2 py-0.5 font-mono text-xs text-slate-200 hover:border-emerald-400 hover:text-emerald-300"
          >
            {chip.command.trim()}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-500">Tab で補完 ・ ↑↓ で履歴</span>
      </div>
    </section>
  )
}
