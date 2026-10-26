// ステージのテストで使う、1人ぶんのプレイ（コマンド・編集・選択・時間の経過を順に入れる）。
import type { Cue } from '../drama/index.ts'
import {
  availableChoices,
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
} from './stage.ts'

const NOW = { timestamp: 1_793_000_000, tzOffset: 540 }

export class Play {
  readonly def: StageDefinition
  session: StageSession
  cues: Cue[] = []
  /** 実時間の経過（ミリ秒） */
  at = 0
  last: StageStep | null = null
  npcLog: string[] = []

  constructor(def: StageDefinition, untimed = false) {
    this.def = def
    const s = startStage(def, NOW, untimed)
    this.session = s.session
    this.cues.push(...s.cues)
  }

  private take(step: StageStep): StageStep {
    this.session = step.session
    this.cues.push(...step.cues)
    this.npcLog.push(...(step.npcLog ?? []))
    this.last = step
    return step
  }

  /** コマンドを打つ（実時間を2秒進めてから） */
  run(command: string): StageStep {
    this.at += 2000
    return this.take(
      stageCommand(
        this.def,
        this.session,
        command,
        this.at,
        { ...NOW, timestamp: NOW.timestamp + this.at / 1000 },
        false,
      ),
    )
  }

  edit(path: string, content: string): void {
    this.session = stageEdit(this.session, path, content)
  }

  choose(id: string): StageStep {
    this.at += 2000
    return this.take(stageChoose(this.def, this.session, id, this.at, false))
  }

  /** 実時間を ms だけ進めて、時間の出来事を起こす */
  wait(ms: number): StageStep {
    this.at += ms
    return this.take(stageTick(this.def, this.session, this.at, false))
  }

  hint(): StageStep {
    return this.take(stageHint(this.def, this.session, this.at, false))
  }

  rollback(): StageStep {
    return this.take(stageRollback(this.def, this.session, this.at, false))
  }

  resetWorld(): StageStep {
    return this.take(stageResetWorld(this.def, this.session, this.at, false))
  }

  /** 出たセリフの key（順に） */
  chats(): string[] {
    return this.cues.flatMap((c) => (c.type === 'chat' ? [c.key] : []))
  }

  /** 出たセリフの文（順に） */
  texts(): string[] {
    return this.cues.flatMap((c) => (c.type === 'chat' ? [c.text] : []))
  }

  /** 結末のセリフ（ending. で始まるもの） */
  endings(): string[] {
    return this.chats().filter((k) => k.startsWith('ending.'))
  }

  reports(): string[] {
    return this.cues.flatMap((c) => (c.type === 'report' ? [c.kind] : []))
  }

  rank(): string | undefined {
    return this.session.drama.finished?.rank
  }

  choices(): string[] {
    return availableChoices(this.def, this.session).map((c) => c.id)
  }

  goals(): boolean[] {
    return this.def
      .goals(this.session.world, this.session.progress, this.session.drama.reports)
      .map((g) => g.done)
  }

  hintKey(): string {
    return this.def.hint(this.session.world, this.session.progress)
  }

  file(path: string): string | undefined {
    const ws = this.session.world.workspaces[this.session.cwd]
    return ws ? ws.files[path] : undefined
  }
}
