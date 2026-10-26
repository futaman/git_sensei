// ステージ（シナリオ1本）を遊んでいるあいだの状態。進行は scenarios/stage.ts に任せ、
// ここでは演出キュー（Cue）を画面の状態（チャット、ゲージ、カットイン、始末書）に変える。
// 1回のプレイで完結するので、保存はしない。
import { create } from 'zustand'
import type {
  Character,
  Cue,
  DangerKind,
  MoodStage,
  Rank,
  TrustStage,
  YabaLevel,
} from '../../drama/index.ts'
import { DRAMA } from '../../drama/index.ts'
import {
  deleteFile,
  has,
  own,
  type PushRejectReason,
  pathConflict,
  writeFile,
} from '../../engine/index.ts'
import {
  type StageDefinition,
  type StageSession,
  type StageStep,
  stageChoose,
  stageCommand,
  stageEdit,
  stageHint,
  stageResetWorld,
  stageRollback,
  stageTick,
  startStage,
} from '../../scenarios/stage.ts'
import { HELP, MAX_LINES, now, outputLines, promptFor, type TerminalLine } from './freeMode.ts'
import { useRecords } from './records.ts'

export interface ChatMessage {
  id: number
  from: Character
  text: string
  style: 'normal' | 'rage' | 'whisper'
}

export interface CutIn {
  id: number
  who: Character
  variant: 'rage' | 'sparkle' | 'despair' | 'thunder'
}

/** コミットグラフの上に重ねる、短い動き */
export type Effect =
  | { id: number; kind: 'rejected'; reason: PushRejectReason }
  | { id: number; kind: 'forced'; lost: number }
  | { id: number; kind: 'pushed' }

export type Phase = 'intro' | 'playing' | 'done'

interface StageState {
  def: StageDefinition | null
  phase: Phase
  untimed: boolean
  /** 開始した時刻（Date.now）。at はここからの経過ミリ秒 */
  startedAt: number
  /** いまの経過ミリ秒（1秒ごとに更新。時計の表示に使う） */
  at: number
  session: StageSession | null
  lines: TerminalLine[]
  history: string[]
  selectedFile: string | null
  nextId: number
  chat: ChatMessage[]
  typing: { who: Character; vanish: boolean; until: number } | null
  face: { stage: TrustStage; direction: 'up' | 'down' | null }
  mood: MoodStage
  trust: number
  moodValue: number
  /** 直近の増減（ゲージの横に一瞬出す） */
  delta: { id: number; trust: number; mood: number } | null
  deadline: 'none' | 'warning' | 'urgent' | 'over'
  /** 作中の時計が飛んだ（数字を早送りで回す） */
  clockJump: { id: number; fromSec: number; toSec: number } | null
  cutin: CutIn | null
  shake: { id: number; intensity: 1 | 2 | 3 } | null
  reports: { kind: DangerKind; level: YabaLevel }[]
  openReport: DangerKind | null
  effect: Effect | null
  rank: { rank: Rank; slow: boolean } | null
  /** 雷が落ちた（実戦型なのでやり直し） */
  thunder: boolean

  load: (def: StageDefinition) => void
  start: (untimed: boolean) => void
  /** 同じ設定（時間制限の有無）で、最初からやり直す */
  restart: () => void
  tick: () => void
  run: (input: string) => void
  hint: () => void
  /** チャットの選択肢を選ぶ */
  choose: (id: string) => void
  /** world だけを最初に戻す（やらかし道場） */
  resetWorld: () => void
  rollback: () => void
  editFile: (path: string, content: string) => void
  createFile: (path: string) => string | null
  removeFile: (path: string) => void
  selectFile: (path: string | null) => void
  showReport: (kind: DangerKind | null) => void
  dismissCutin: () => void
  exit: () => void
}

const EMPTY = {
  phase: 'intro' as Phase,
  untimed: false,
  startedAt: 0,
  at: 0,
  session: null,
  lines: [],
  history: [],
  selectedFile: null,
  nextId: 0,
  chat: [],
  typing: null,
  face: { stage: 'expect' as TrustStage, direction: null },
  mood: 'normal' as MoodStage,
  trust: DRAMA.trust.initial,
  moodValue: DRAMA.mood.initial,
  delta: null,
  deadline: 'none' as const,
  clockJump: null,
  cutin: null,
  shake: null,
  reports: [],
  openReport: null,
  effect: null,
  rank: null,
  thunder: false,
}

type Patch = Partial<StageState>

/** キューを画面の状態に変える */
function applyCues(s: StageState, cues: Cue[], patch: Patch): Patch {
  let id = patch.nextId ?? s.nextId
  const chat = [...(patch.chat ?? s.chat)]
  const at = patch.at ?? s.at
  for (const cue of cues) {
    switch (cue.type) {
      case 'chat':
        chat.push({ id: id++, from: cue.from, text: cue.text, style: cue.style })
        patch.typing = null
        break
      case 'typing':
        patch.typing = { who: cue.who, vanish: cue.vanish, until: at + 2500 }
        break
      case 'face':
        patch.face = { stage: cue.stage, direction: cue.direction }
        break
      case 'mood':
        patch.mood = cue.stage
        break
      case 'gauge':
        patch.trust = cue.trust
        patch.moodValue = cue.mood
        patch.delta = { id: id++, trust: cue.trustDelta, mood: cue.moodDelta }
        break
      case 'cutin':
        patch.cutin = { id: id++, who: cue.who, variant: cue.variant }
        if (cue.variant === 'thunder') patch.thunder = true
        break
      case 'shake':
        patch.shake = { id: id++, intensity: cue.intensity }
        break
      case 'report':
        patch.reports = [...(patch.reports ?? s.reports), { kind: cue.kind, level: cue.level }]
        patch.openReport = cue.kind
        break
      case 'clock':
        patch.clockJump = { id: id++, fromSec: cue.extraSec - cue.jumpedSec, toSec: cue.extraSec }
        break
      case 'deadline':
        patch.deadline = cue.level
        break
      case 'rank':
        patch.rank = { rank: cue.rank, slow: cue.slow }
        patch.phase = 'done'
        break
    }
  }
  patch.chat = chat.slice(-200)
  patch.nextId = id
  return patch
}

export const useStage = create<StageState>()((set, get) => {
  const elapsed = () => Date.now() - get().startedAt
  /** 進行の1ステップを反映する */
  const apply = (step: StageStep, patch: Patch = {}) => {
    const s = get()
    // NPC の操作（同僚の push など）は、ターミナルに紫の行で出す
    if (step.npcLog && step.npcLog.length > 0) {
      let id = patch.nextId ?? s.nextId
      const npc = step.npcLog.map((text) => ({ id: id++, kind: 'npc' as const, text }))
      patch.lines = [...(patch.lines ?? s.lines), ...npc].slice(-MAX_LINES)
      patch.nextId = id
    }
    const next = applyCues(s, step.cues, { ...patch, session: step.session })
    set(next)
    // クリアしたら、いちばん良いランクを残す
    if (next.rank && !s.rank && step.session.cleared && s.def) {
      useRecords.getState().record(s.def.id, next.rank.rank)
    }
  }

  return {
    def: null,
    ...EMPTY,

    load(def) {
      set({ def, ...EMPTY })
    },

    start(untimed) {
      const { def } = get()
      if (!def) return
      const step = startStage(def, now(), untimed)
      let id = 0
      const chat: ChatMessage[] = def.intro.map((m) => ({ id: id++, style: 'normal', ...m }))
      const lines: TerminalLine[] = [
        {
          id: id++,
          kind: 'info',
          text: `${def.title}：${def.mission.task}（締切 ${def.mission.due}）`,
        },
        {
          id: id++,
          kind: 'info',
          text: def.terminalIntro ?? 'まずは git status で、いまの状態を見てみましょう。',
        },
      ]
      set({
        ...EMPTY,
        phase: 'playing',
        untimed,
        startedAt: Date.now(),
        chat,
        lines,
        nextId: id,
        selectedFile: null,
      })
      apply(step)
    },

    restart() {
      get().start(get().untimed)
    },

    tick() {
      const { def, session, phase, untimed, typing } = get()
      if (!def || !session || phase !== 'playing') return
      const at = elapsed()
      const step = stageTick(def, session, at, untimed)
      apply(step, { at, typing: typing && typing.until < at ? null : typing })
    },

    run(input) {
      const { def, session, phase, untimed, history, nextId } = get()
      if (!def || !session || phase !== 'playing') return
      const trimmed = input.trim()
      let id = nextId
      const add: TerminalLine[] = [
        {
          id: id++,
          kind: 'input',
          text: input,
          prompt: promptFor(session.world, session.cwd, def.home),
        },
      ]
      const newHistory = trimmed && history.at(-1) !== trimmed ? [...history, trimmed] : history
      if (trimmed === 'clear') {
        set({ lines: [], history: newHistory, nextId: id })
        return
      }
      if (trimmed === '' || trimmed === 'help') {
        if (trimmed === 'help') for (const text of HELP) add.push({ id: id++, kind: 'info', text })
        set((s) => ({
          lines: [...s.lines, ...add].slice(-MAX_LINES),
          history: newHistory,
          nextId: id,
        }))
        return
      }

      const at = elapsed()
      const step = stageCommand(def, session, trimmed, at, now(), untimed)
      if (step.result) {
        const out = outputLines(step.result, id, trimmed)
        add.push(...out)
        id += out.length
      }
      let effect: Effect | null = get().effect
      for (const e of step.result?.events ?? []) {
        if (e.type === 'PUSH_REJECTED') effect = { id: id++, kind: 'rejected', reason: e.reason }
        else if (e.type === 'FORCE_PUSH_OVERWROTE')
          effect = { id: id++, kind: 'forced', lost: e.lostCommits.length }
        else if (e.type === 'PUSHED' && effect?.kind !== 'forced')
          effect = { id: id++, kind: 'pushed' }
      }
      const cwdChanged = step.session.cwd !== session.cwd
      apply(step, {
        at,
        lines: [...get().lines, ...add].slice(-MAX_LINES),
        history: newHistory,
        nextId: id,
        effect,
        selectedFile: cwdChanged ? null : get().selectedFile,
      })
    },

    choose(id) {
      const { def, session, phase, untimed } = get()
      if (!def || !session || phase !== 'playing') return
      const at = elapsed()
      apply(stageChoose(def, session, id, at, untimed), { at })
    },

    resetWorld() {
      const { def, session, phase, untimed, nextId } = get()
      if (!def || !session || phase !== 'playing') return
      const at = elapsed()
      apply(stageResetWorld(def, session, at, untimed), {
        at,
        effect: null,
        selectedFile: null,
        nextId: nextId + 1,
        lines: [
          ...get().lines,
          { id: nextId, kind: 'info', text: `── ${def.resetWorld?.label ?? '元に戻しました'} ──` },
        ],
      })
    },

    hint() {
      const { def, session, phase, untimed } = get()
      if (!def || !session || phase !== 'playing') return
      const at = elapsed()
      apply(stageHint(def, session, at, untimed), { at })
    },

    rollback() {
      const { def, session, untimed, nextId } = get()
      if (!def || !session?.checkpoint) return
      const at = elapsed()
      apply(stageRollback(def, session, at, untimed), {
        at,
        openReport: null,
        effect: null,
        nextId: nextId + 1,
        lines: [
          ...get().lines,
          { id: nextId, kind: 'info', text: '── チェックポイント（push の前）に戻りました ──' },
        ],
      })
    },

    editFile(path, content) {
      const { session } = get()
      if (!session || get().phase !== 'playing') return
      set({ session: stageEdit(session, path, content) })
    },

    createFile(path) {
      const { session } = get()
      if (!session) return null
      const ws = own(session.world.workspaces, session.cwd)
      if (!ws) return null
      if (has(ws.files, path)) {
        set({ selectedFile: path })
        return null
      }
      const conflict = pathConflict(session.world, ws, path)
      if (conflict?.kind === 'parentIsFile') {
        return `同じ名前のファイル ${conflict.path} があるので、その中にはファイルを作れません`
      }
      if (conflict?.kind === 'isDirectory') return `同じ名前のフォルダ ${path} があります`
      if (conflict?.kind === 'insideWorkspace') {
        return `${conflict.name} は別のフォルダです。cd ${conflict.name} で入ってから作ってください`
      }
      set({
        session: { ...session, world: writeFile(session.world, session.cwd, path, '') },
        selectedFile: path,
      })
      return null
    },

    removeFile(path) {
      const { session, selectedFile } = get()
      if (!session) return
      set({
        session: { ...session, world: deleteFile(session.world, session.cwd, path) },
        selectedFile: selectedFile === path ? null : selectedFile,
      })
    },

    selectFile(path) {
      set({ selectedFile: path })
    },

    showReport(kind) {
      set({ openReport: kind })
    },

    dismissCutin() {
      set({ cutin: null })
    },

    exit() {
      set({ def: null, ...EMPTY })
    },
  }
})
