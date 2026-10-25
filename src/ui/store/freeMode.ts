// フリーモード（シナリオなしの練習場）の状態。world をエンジンに渡してコマンドを実行する。
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  createWorld,
  deleteFile,
  type ExecContext,
  execute,
  type GitEvent,
  type World,
  writeFile,
} from '../../engine/index.ts'
import { safeStorage } from '../storage.ts'

export const WS = 'me'

export type LineKind = 'input' | 'stdout' | 'stderr' | 'unsupported' | 'info'

export interface TerminalLine {
  id: number
  kind: LineKind
  text: string
  /** 入力行のときのプロンプト */
  prompt?: string
}

export interface LoggedEvent {
  id: number
  event: GitEvent
  command: string
}

interface FreeModeState {
  world: World
  lines: TerminalLine[]
  history: string[]
  events: LoggedEvent[]
  selectedFile: string | null
  nextId: number
  run: (input: string) => void
  editFile: (path: string, content: string) => void
  createFile: (path: string) => void
  removeFile: (path: string) => void
  selectFile: (path: string | null) => void
  reset: () => void
}

function initialWorld(): World {
  return createWorld(
    {
      [WS]: {
        path: '/home/you/my-project',
        files: {
          'README.md': '# my-project\n\ngitの練習用のプロジェクトです。\n',
          'src/app.js': "console.log('hello')\n",
        },
      },
    },
    { 'user.name': 'あなた', 'user.email': 'you@example.com' },
  )
}

function welcome(): TerminalLine[] {
  return [
    { id: 0, kind: 'info', text: 'フリーモードへようこそ。ここでは自由にgitを試せます。' },
    {
      id: 1,
      kind: 'info',
      text: 'まずは git init と打ってみましょう。help で使えるコマンドを表示します。',
    },
  ]
}

export function promptFor(world: World): string {
  const ws = world.workspaces[WS]
  const dir = ws?.path.split('/').pop() ?? ''
  const git = ws?.git
  let branch = ''
  if (git) {
    branch =
      git.head.type === 'symbolic'
        ? ` (${git.head.ref.replace('refs/heads/', '')})`
        : ` (${git.head.oid.slice(0, 7)}...)`
  }
  return `you@sensei:~/${dir}${branch}$`
}

function now(): ExecContext['now'] {
  return { timestamp: Math.floor(Date.now() / 1000), tzOffset: -new Date().getTimezoneOffset() }
}

const HELP = [
  '使えるコマンド（M2時点）:',
  '  git init / add / commit / status / log / branch / switch / checkout / merge',
  '  clear  … ターミナルを消す',
  'ファイルの作成・編集は左のファイル一覧とエディタで行います。',
]

const MAX_LINES = 500

export const useFreeMode = create<FreeModeState>()(
  persist(
    (set, get) => ({
      world: initialWorld(),
      lines: welcome(),
      history: [],
      events: [],
      selectedFile: 'README.md',
      nextId: 2,

      run(input) {
        const { world, nextId, history } = get()
        const trimmed = input.trim()
        let id = nextId
        const add: TerminalLine[] = [
          { id: id++, kind: 'input', text: input, prompt: promptFor(world) },
        ]
        const newHistory = trimmed && history.at(-1) !== trimmed ? [...history, trimmed] : history

        if (trimmed === 'clear') {
          set({ lines: [], history: newHistory, nextId: id })
          return
        }
        if (trimmed === 'help') {
          for (const text of HELP) add.push({ id: id++, kind: 'info', text })
          set((s) => ({
            lines: [...s.lines, ...add].slice(-MAX_LINES),
            history: newHistory,
            nextId: id,
          }))
          return
        }

        const r = trimmed ? execute(world, trimmed, { workspace: WS, now: now(), tty: true }) : null
        if (r) {
          const push = (kind: LineKind, text: string) => {
            for (const line of text.replace(/\n$/, '').split('\n'))
              add.push({ id: id++, kind, text: line })
          }
          if (r.stdout) push('stdout', r.stdout)
          if (r.stderr) push(r.unsupported ? 'unsupported' : 'stderr', r.stderr)
        }
        const logged = (r?.events ?? []).map((event) => ({ id: id++, event, command: trimmed }))
        set((s) => ({
          world: r?.world ?? world,
          lines: [...s.lines, ...add].slice(-MAX_LINES),
          events: [...s.events, ...logged].slice(-200),
          history: newHistory,
          nextId: id,
        }))
      },

      editFile(path, content) {
        set((s) => ({ world: writeFile(s.world, WS, path, content) }))
      },
      createFile(path) {
        const ws = get().world.workspaces[WS]
        if (!ws || path in ws.files) {
          set({ selectedFile: path })
          return
        }
        set((s) => ({ world: writeFile(s.world, WS, path, ''), selectedFile: path }))
      },
      removeFile(path) {
        set((s) => ({
          world: deleteFile(s.world, WS, path),
          selectedFile: s.selectedFile === path ? null : s.selectedFile,
        }))
      },
      selectFile(path) {
        set({ selectedFile: path })
      },
      reset() {
        set({
          world: initialWorld(),
          lines: welcome(),
          history: [],
          events: [],
          selectedFile: 'README.md',
          nextId: 2,
        })
      },
    }),
    {
      name: 'git-sensei:free-mode',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({
        world: s.world,
        lines: s.lines,
        history: s.history.slice(-100),
        events: s.events,
        selectedFile: s.selectedFile,
        nextId: s.nextId,
      }),
    },
  ),
)
