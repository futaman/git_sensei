// 保存データ（localStorage）の読み込み。壊れたデータを読み込んで画面が開けなくなるのを防ぐ。
// 形を確かめたうえで、画面と同じ問い合わせ（fileStates / repoView / remoteSummaries）を
// 試しに実行し、例外が出たら保存データを捨てて初期状態から始める。
import {
  fileStates,
  remoteSummaries,
  repoView,
  reviveWorld,
  type World,
} from '../../engine/index.ts'
import { describeEvent } from '../components/events/describe.ts'
import type { LoggedEvent, Preset, TerminalLine } from './freeMode.ts'

/** 保存しているもの（freeMode.ts の partialize と同じ形） */
export interface SavedState {
  preset: Preset
  world: World
  cwd: string
  lines: TerminalLine[]
  history: string[]
  events: LoggedEvent[]
  selectedFile: string | null
  nextId: number
  beat: number
}

const LINE_KINDS: readonly string[] = ['input', 'stdout', 'stderr', 'unsupported', 'info', 'npc']
const PRESETS: readonly string[] = ['solo', 'team']

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isStringRecord = (v: unknown): boolean =>
  isObject(v) && Object.values(v).every((x) => typeof x === 'string')

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0

function isWorld(v: unknown, cwd: string): v is World {
  if (!isObject(v) || !isObject(v.workspaces) || !isStringRecord(v.globalConfig)) return false
  if (!Object.hasOwn(v.workspaces, cwd)) return false
  return Object.values(v.workspaces).every((ws) => {
    if (!isObject(ws) || typeof ws.path !== 'string' || !isStringRecord(ws.files)) return false
    const git = ws.git
    if (git === null) return true
    return (
      isObject(git) &&
      typeof git.bare === 'boolean' &&
      isObject(git.objects) &&
      isStringRecord(git.refs) &&
      isStringRecord(git.symrefs) &&
      isObject(git.index) &&
      isObject(git.unmerged) &&
      (git.merge === null ||
        (isObject(git.merge) &&
          typeof git.merge.head === 'string' &&
          typeof git.merge.message === 'string')) &&
      isStringRecord(git.config) &&
      isObject(git.head)
    )
  })
}

/**
 * 保存データを確かめて、使える形に戻す。world か cwd が壊れていれば null（全部捨てて初期状態にする）。
 * world 以外（ターミナルの行など）は、壊れていればその部分だけ捨てる
 */
export function restoreSaved(saved: unknown): Partial<SavedState> | null {
  if (!isObject(saved) || typeof saved.cwd !== 'string') return null
  if (!isWorld(saved.world, saved.cwd)) return null
  let world: World
  try {
    world = reviveWorld(saved.world)
    for (const ws of Object.values(world.workspaces)) {
      fileStates(ws)
      remoteSummaries(world, ws)
      if (ws.git && !ws.git.bare) repoView(ws.git)
    }
  } catch {
    return null
  }

  const out: Partial<SavedState> = { world, cwd: saved.cwd }
  if (typeof saved.preset === 'string' && PRESETS.includes(saved.preset)) {
    out.preset = saved.preset as Preset
  }
  if (isCount(saved.beat)) out.beat = saved.beat
  const lines = saved.lines
  if (
    Array.isArray(lines) &&
    lines.every(
      (l) =>
        isObject(l) &&
        typeof l.id === 'number' &&
        typeof l.text === 'string' &&
        typeof l.kind === 'string' &&
        LINE_KINDS.includes(l.kind),
    )
  ) {
    out.lines = lines as SavedState['lines']
  }
  const history = saved.history
  if (Array.isArray(history) && history.every((h) => typeof h === 'string')) {
    out.history = history
  }
  const events = saved.events
  if (Array.isArray(events)) {
    try {
      for (const e of events) {
        if (
          !isObject(e) ||
          typeof e.id !== 'number' ||
          typeof e.command !== 'string' ||
          (e.actor !== null && typeof e.actor !== 'string')
        ) {
          throw new Error('できごとの形が違います')
        }
        const d = describeEvent(e.event as LoggedEvent['event'])
        if (!isObject(d) || typeof d.text !== 'string') throw new Error('知らないできごとです')
      }
      out.events = events as SavedState['events']
    } catch {
      // できごと欄だけ空にする
    }
  }
  const selected = saved.selectedFile
  if (selected === null || typeof selected === 'string') out.selectedFile = selected
  // 行とできごとの id（React の key）がぶつからないよう、使った id より大きくする
  const used = [...(out.lines ?? []), ...(out.events ?? [])].map((x) => x.id + 1)
  const nextId =
    typeof saved.nextId === 'number' && Number.isFinite(saved.nextId) ? saved.nextId : 0
  out.nextId = Math.max(nextId, 3, ...used)
  return out
}
