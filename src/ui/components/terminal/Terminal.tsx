import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { completionNames, fileStates, own, repoView, serverPaths } from '../../../engine/index.ts'
import { MOBILE_QUERY, useMediaQuery } from '../../hooks/useMediaQuery.ts'
import { usePlay } from '../../play/PlayContext.tsx'
import { promptFor, type TerminalLine } from '../../store/freeMode.ts'
import { CommandPalette } from './CommandPalette.tsx'
import { suggestChips } from './chips.ts'
import { complete } from './completion.ts'
import { appendPart, dropLastPart, type PalettePart, paletteForInput } from './palette.ts'

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

/** 直前のコマンドの出力に「push が弾かれた」が含まれるか（パレットで --force の誘惑を出す） */
function lastWasRejected(lines: TerminalLine[]): boolean {
  let i = lines.length - 1
  while (i >= 0 && lines[i]?.kind !== 'input') {
    if (/\[rejected\]/.test(lines[i]?.text ?? '')) return true
    i--
  }
  return false
}

const DANGEROUS = /(^|\s)(--force|--hard|-rf|-fr)(\s|$)/

export function Terminal() {
  const { lines, history, world, cwd, home, run, chips: scenarioChips, locked } = usePlay()
  const mobile = useMediaQuery(MOBILE_QUERY)

  const [input, setInput] = useState('')
  const [candidates, setCandidates] = useState<string[]>([])
  const [paletteOpen, setPaletteOpen] = useState(false)
  const historyIndex = useRef<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const ws = own(world.workspaces, cwd)
  const files = useMemo(() => (ws ? fileStates(ws) : []), [ws])
  const view = useMemo(() => (ws?.git && !ws.git.bare ? repoView(ws.git) : null), [ws])
  const clonedChildren = useMemo(
    () =>
      ws
        ? Object.values(world.workspaces)
            .filter((w) => w.git && !w.git.bare && w.path.startsWith(`${ws.path}/`))
            .map((w) => w.path.slice(ws.path.length + 1))
            .filter((rel) => !rel.includes('/'))
        : [],
    [ws, world],
  )
  const chips = useMemo(() => {
    if (scenarioChips) return scenarioChips
    if (!ws) return []
    return suggestChips({
      git: ws.git,
      files,
      view,
      servers: serverPaths(world),
      clonedChildren,
    })
  }, [ws, world, files, view, clonedChildren, scenarioChips])

  const showPalette = mobile || paletteOpen
  const sections = useMemo(() => {
    if (!showPalette) return []
    return paletteForInput(input, {
      git: ws?.git ?? null,
      files,
      view,
      servers: serverPaths(world),
      clonedChildren,
      rejected: lastWasRejected(lines),
    })
  }, [showPalette, input, ws, files, view, world, clonedChildren, lines])

  // 出力や補完候補が増えたら最下部までスクロールする（依存は「増えた」きっかけとして使う）
  // biome-ignore lint/correctness/useExhaustiveDependencies: 上のとおり
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [lines, candidates])

  const submit = () => {
    if (locked || input.trim() === '') return
    run(input)
    setInput('')
    setCandidates([])
    historyIndex.current = null
  }

  const recall = (dir: 'up' | 'down') => {
    if (history.length === 0) return
    const cur = historyIndex.current ?? history.length
    const next = dir === 'up' ? Math.max(cur - 1, 0) : cur + 1
    if (next >= history.length) {
      historyIndex.current = null
      setInput('')
    } else {
      historyIndex.current = next
      setInput(history[next] ?? '')
    }
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
      recall(e.key === 'ArrowUp' ? 'up' : 'down')
    } else if (e.key === 'c' && e.ctrlKey && !window.getSelection()?.toString()) {
      e.preventDefault()
      setInput('')
      setCandidates([])
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault()
      run('clear')
    }
  }

  /** 入力欄に文字を置き、カーソルを合わせる。スマホではキーボードが要るときだけフォーカスする */
  const place = (command: string, cursorBack = 0, focus = true) => {
    setInput(command)
    setCandidates([])
    if (!focus) return
    // すぐ入力欄に戻す（ボタンにフォーカスが残ると、続けて押した Enter がボタンに行ってしまう）
    inputRef.current?.focus()
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      const pos = command.length - cursorBack
      el.setSelectionRange(pos, pos)
    })
  }

  const applyChip = (command: string, cursorBack = 0) => place(command, cursorBack)

  const pick = (part: PalettePart) => {
    const needsKeyboard = part.cursorBack !== undefined || part.text.endsWith(' ')
    place(appendPart(input, part.text), part.cursorBack ?? 0, !mobile || needsKeyboard)
  }

  const dangerous = DANGEROUS.test(input)

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col bg-slate-900 font-mono text-[13px] leading-relaxed">
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: クリックで入力欄にフォーカスするだけ。キーボードでは入力欄に直接入れる */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: 同上 */}
      <div
        className="min-h-0 flex-1 overflow-y-auto px-4 pt-3"
        onClick={() => {
          if (!mobile && !window.getSelection()?.toString()) inputRef.current?.focus()
        }}
      >
        {lines.map((line) => (
          <div key={line.id} className={`whitespace-pre-wrap break-all ${lineClass(line)}`}>
            {line.kind === 'input' && <span className="mr-2 text-emerald-400">{line.prompt}</span>}
            {line.kind === 'unsupported' && <span className="mr-1">⚠</span>}
            {line.text || ' '}
          </div>
        ))}
        {!mobile && (
          <div className="flex items-center">
            <label htmlFor="terminal-input" className="mr-2 shrink-0 text-emerald-400">
              {promptFor(world, cwd, home)}
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
              disabled={locked}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              // biome-ignore lint/a11y/noAutofocus: ターミナルを開いたらすぐ打てるようにする
              autoFocus
              className="min-w-0 flex-1 bg-transparent text-slate-100 caret-emerald-400 outline-none"
            />
          </div>
        )}
        {candidates.length > 0 && <div className="text-slate-400">{candidates.join('  ')}</div>}
        <div ref={bottomRef} className="h-3" />
      </div>

      {mobile && (
        // スマホ：入力欄を出力の下に固定し、横に「実行」。キーボードは入力欄に触ったときだけ出る
        <div className="flex items-center gap-1.5 border-t border-slate-700 px-3 py-2">
          <button
            type="button"
            onClick={() => recall('up')}
            disabled={history.length === 0}
            aria-label="前のコマンド"
            className="shrink-0 rounded-full border border-slate-600 px-2.5 py-1 text-xs text-slate-300 disabled:opacity-40"
          >
            ↑
          </button>
          <div
            className={`flex min-w-0 flex-1 items-center rounded-lg border bg-slate-950 px-2 py-1.5 ${
              dangerous ? 'border-rose-500' : 'border-slate-600'
            }`}
          >
            <label htmlFor="terminal-input" className="mr-1.5 shrink-0 text-emerald-400">
              $
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
              disabled={locked}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              inputMode="text"
              enterKeyHint="go"
              placeholder="下のボタンで組み立てる"
              aria-label="コマンド"
              className="min-w-0 flex-1 bg-transparent text-slate-100 caret-emerald-400 outline-none placeholder:text-slate-600"
            />
            {input !== '' && (
              <button
                type="button"
                onClick={() => place(dropLastPart(input), 0, false)}
                aria-label="最後の部品を消す"
                className="ml-1 shrink-0 px-1 text-slate-400"
              >
                ⌫
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={locked || input.trim() === ''}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40 ${
              dangerous ? 'bg-rose-600' : 'bg-emerald-600'
            }`}
          >
            実行
          </button>
        </div>
      )}

      {!mobile && (
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
          <button
            type="button"
            onClick={() => setPaletteOpen((v) => !v)}
            aria-pressed={paletteOpen}
            className={`rounded border px-2 py-0.5 text-xs ${
              paletteOpen
                ? 'border-emerald-400 text-emerald-300'
                : 'border-slate-600 text-slate-300 hover:border-slate-400'
            }`}
          >
            ⌨ パレット
          </button>
        </div>
      )}

      {showPalette && (
        <div className={`font-sans ${mobile ? '' : 'border-t border-slate-800'}`}>
          <CommandPalette
            sections={sections}
            onPick={pick}
            emptyText={
              input.trim() === '' ? undefined : '続きはキーボードで打てます。打ち終わったら「実行」'
            }
          />
        </div>
      )}
    </section>
  )
}
