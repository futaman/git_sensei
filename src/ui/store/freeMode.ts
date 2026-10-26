// フリーモード（シナリオなしの練習場）の状態。world をエンジンに渡してコマンドを実行する。
// 「ひとりで練習」と、同僚（NPC）がいる「チームで練習」の2つの舞台がある。
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  createWorld,
  deleteFile,
  type ExecContext,
  type ExecuteResult,
  execute,
  type GitEvent,
  has,
  own,
  pathConflict,
  type Workspace,
  type World,
  writeFile,
} from '../../engine/index.ts'
import { runBeat } from '../../scenarios/npc.ts'
import {
  buildTeamWorld,
  TEAM_ACTORS,
  TEAM_BEATS,
  TEAM_PATHS,
} from '../../scenarios/sandbox/team.ts'
import { explain } from '../components/terminal/explain.ts'
import { safeStorage } from '../storage.ts'
import { restoreSaved } from './restore.ts'

export type Preset = 'solo' | 'team'

/** localStorage に保存するときの名前 */
export const STORAGE_KEY = 'git-sensei:free-mode'

export const HOME = '/home/you'
const PLAYER = { name: 'あなた', email: 'you@example.com' }

export type LineKind = 'input' | 'stdout' | 'stderr' | 'unsupported' | 'info' | 'npc'

export interface TerminalLine {
  id: number
  kind: LineKind
  text: string
  /** 入力行のときのプロンプト */
  prompt?: string
}

export interface LoggedEvent {
  id: number
  /** 同僚の操作なら、その名前。自分の操作なら null */
  actor: string | null
  event: GitEvent
  command: string
}

interface Stage {
  world: World
  cwd: string
  lines: TerminalLine[]
  selectedFile: string | null
}

interface FreeModeState extends Stage {
  preset: Preset
  history: string[]
  events: LoggedEvent[]
  nextId: number
  /** チームで練習：次に実行する同僚の作業の番号 */
  beat: number
  run: (input: string) => void
  runNextBeat: () => void
  editFile: (path: string, content: string) => void
  /** ファイルを作って選ぶ。作れないときは理由（画面に出す文）を返す */
  createFile: (path: string) => string | null
  removeFile: (path: string) => void
  selectFile: (path: string | null) => void
  reset: (preset?: Preset) => void
}

function info(id: number, text: string): TerminalLine {
  return { id, kind: 'info', text }
}

function initialStage(preset: Preset): Stage {
  if (preset === 'team') {
    return {
      world: buildTeamWorld(now(), PLAYER),
      cwd: HOME,
      selectedFile: null,
      lines: [
        info(0, 'チームで練習：サーバーにチームのリポジトリがあり、先輩と後輩が作業しています。'),
        info(
          1,
          `まずは git clone ${TEAM_PATHS.origin} で手元にコピーし、cd team-project で入りましょう。`,
        ),
        info(2, '上の「同僚が作業する」ボタンで、同僚が1つずつ作業を進めます（push してきます）。'),
      ],
    }
  }
  const project = `${HOME}/my-project`
  return {
    world: createWorld(
      {
        [HOME]: { path: HOME },
        [project]: {
          path: project,
          files: {
            'README.md': '# my-project\n\ngitの練習用のプロジェクトです。\n',
            'src/app.js': "console.log('hello')\n",
          },
        },
      },
      { 'user.name': PLAYER.name, 'user.email': PLAYER.email },
    ),
    cwd: project,
    selectedFile: 'README.md',
    lines: [
      info(0, 'フリーモードへようこそ。ここでは自由にgitを試せます。'),
      info(1, 'まずは git init と打ってみましょう。help で使えるコマンドを表示します。'),
    ],
  }
}

/** いまいるフォルダ */
export function currentWorkspace(s: { world: World; cwd: string }): Workspace | undefined {
  return own(s.world.workspaces, s.cwd)
}

export function promptFor(world: World, cwd: string, home: string = HOME): string {
  const ws = own(world.workspaces, cwd)
  const path = ws?.path ?? cwd
  const shown =
    path === home ? '~' : path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path
  const git = ws?.git
  let branch = ''
  if (git && !git.bare) {
    const where =
      git.head.type === 'symbolic'
        ? git.head.ref.replace('refs/heads/', '')
        : `${git.head.oid.slice(0, 7)}...`
    // マージの途中は git-prompt と同じく |MERGING を付ける
    branch = ` (${where}${git.merge ? '|MERGING' : ''})`
  }
  return `you@sensei:${shown}${branch}$`
}

export const HELP = [
  '使えるコマンド:',
  '  git init / add / commit / status / log / branch / switch / checkout',
  '  git diff / show            … 変更やコミットの中身を見る',
  '  git restore / checkout -- <file> / reset  … 取り消す（ORIG_HEAD も使えます）',
  '  git rm / mv                … ファイルを消す・名前を変える',
  '  git merge（--no-ff / --abort / --continue）',
  '  git clone / remote / fetch / pull / push / config',
  '  cd / pwd / ls / cat / echo / touch / mkdir / rm / mv / cp',
  '  echo hello > a.txt         … 出力をファイルに書く（>> で追記）',
  '  clear  … ターミナルを消す',
  'ファイルの編集は、左のファイル一覧とエディタでもできます。',
]

export const MAX_LINES = 500

/** コマンドの出力を、ターミナルの行にする。つまずきやすいエラーには、日本語のひとことを添える */
export function outputLines(
  r: Pick<ExecuteResult, 'stdout' | 'stderr' | 'unsupported'>,
  firstId: number,
  command = '',
): TerminalLine[] {
  const out: TerminalLine[] = []
  let id = firstId
  const push = (kind: LineKind, text: string) => {
    for (const line of text.replace(/\n$/, '').split('\n')) out.push({ id: id++, kind, text: line })
  }
  if (r.stdout) push('stdout', r.stdout)
  if (r.stderr) push(r.unsupported ? 'unsupported' : 'stderr', r.stderr)
  const note = r.unsupported ? null : explain(command, `${r.stdout}${r.stderr}`)
  if (note) out.push({ id: id++, kind: 'info', text: `ヒント：${note}` })
  return out
}

export function now(): ExecContext['now'] {
  return { timestamp: Math.floor(Date.now() / 1000), tzOffset: -new Date().getTimezoneOffset() }
}

export const useFreeMode = create<FreeModeState>()(
  persist(
    (set, get) => ({
      ...initialStage('solo'),
      preset: 'solo',
      history: [],
      events: [],
      nextId: 3,
      beat: 0,

      run(input) {
        const { world, cwd, nextId, history } = get()
        const trimmed = input.trim()
        let id = nextId
        const add: TerminalLine[] = [
          { id: id++, kind: 'input', text: input, prompt: promptFor(world, cwd) },
        ]
        const newHistory = trimmed && history.at(-1) !== trimmed ? [...history, trimmed] : history

        if (trimmed === 'clear') {
          set({ lines: [], history: newHistory, nextId: id })
          return
        }
        if (trimmed === 'help') {
          for (const text of HELP) add.push(info(id++, text))
          set((s) => ({
            lines: [...s.lines, ...add].slice(-MAX_LINES),
            history: newHistory,
            nextId: id,
          }))
          return
        }

        const r = trimmed
          ? execute(world, trimmed, { workspace: cwd, now: now(), tty: true, home: HOME })
          : null
        if (r) {
          const out = outputLines(r, id, trimmed)
          add.push(...out)
          id += out.length
        }
        const logged = (r?.events ?? []).map((event) => ({
          id: id++,
          actor: null,
          event,
          command: trimmed,
        }))
        const nextCwd = r?.cwd ?? cwd
        set((s) => ({
          world: r?.world ?? world,
          cwd: nextCwd,
          selectedFile: nextCwd === cwd ? s.selectedFile : null,
          lines: [...s.lines, ...add].slice(-MAX_LINES),
          events: [...s.events, ...logged].slice(-200),
          history: newHistory,
          nextId: id,
        }))
      },

      runNextBeat() {
        const { world, beat, nextId } = get()
        const next = TEAM_BEATS[beat]
        if (!next) return
        const r = runBeat(world, next, TEAM_ACTORS, now())
        let id = nextId
        const lines: TerminalLine[] = [{ id: id++, kind: 'npc', text: `── ${next.title} ──` }]
        for (const step of r.log) {
          lines.push({ id: id++, kind: 'npc', text: `  ${step.actor}$ ${step.command}` })
        }
        if (r.failed) {
          lines.push({
            id: id++,
            kind: 'npc',
            text: `  （${r.failed.actor} の「${r.failed.command}」が失敗しました。${r.failed.result.stderr.split('\n').find((l) => /^(fatal|error)/.test(l)) ?? ''}）`,
          })
        }
        const logged = r.events.map((e) => ({ id: id++, ...e }))
        set((s) => ({
          world: r.world,
          beat: beat + 1,
          lines: [...s.lines, ...lines].slice(-MAX_LINES),
          events: [...s.events, ...logged].slice(-200),
          nextId: id,
        }))
      },

      editFile(path, content) {
        set((s) => ({ world: writeFile(s.world, s.cwd, path, content) }))
      },
      createFile(path) {
        const { world } = get()
        const ws = currentWorkspace(get())
        if (!ws) return null
        if (has(ws.files, path)) {
          set({ selectedFile: path })
          return null
        }
        // 'd' と 'd/x' を両方作ると、本物の git では作れない tree ができてしまう（検証レポート B5）
        const conflict = pathConflict(world, ws, path)
        if (conflict?.kind === 'parentIsFile') {
          return `同じ名前のファイル ${conflict.path} があるので、その中にはファイルを作れません`
        }
        if (conflict?.kind === 'isDirectory') return `同じ名前のフォルダ ${path} があります`
        if (conflict?.kind === 'insideWorkspace') {
          return `${conflict.name} は別のフォルダです。cd ${conflict.name} で入ってから作ってください`
        }
        set((s) => ({ world: writeFile(s.world, s.cwd, path, ''), selectedFile: path }))
        return null
      },
      removeFile(path) {
        set((s) => ({
          world: deleteFile(s.world, s.cwd, path),
          selectedFile: s.selectedFile === path ? null : s.selectedFile,
        }))
      },
      selectFile(path) {
        set({ selectedFile: path })
      },
      reset(preset) {
        const p = preset ?? get().preset
        set({ ...initialStage(p), preset: p, history: [], events: [], nextId: 3, beat: 0 })
      },
    }),
    {
      name: STORAGE_KEY,
      // 3: マージ（コンフリクト）対応で world の形が変わった。古い保存データは捨てて最初から
      version: 3,
      migrate: () => ({}) as FreeModeState,
      storage: createJSONStorage(() => safeStorage),
      // 壊れた保存データは捨てて、初期状態から始める（検証レポート B2）
      merge: (saved, current) => ({ ...current, ...restoreSaved(saved) }),
      partialize: (s) => ({
        preset: s.preset,
        world: s.world,
        cwd: s.cwd,
        lines: s.lines,
        history: s.history.slice(-100),
        events: s.events,
        selectedFile: s.selectedFile,
        nextId: s.nextId,
        beat: s.beat,
      }),
    },
  ),
)

export const TEAM_BEAT_COUNT = TEAM_BEATS.length
export const teamBeatTitle = (i: number) => TEAM_BEATS[i]?.title ?? null
