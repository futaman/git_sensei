// 「金曜17:45、定時前の push」：作者の解答手順で par どおりにクリアでき、落とし穴が設計どおりに動くか。
import { describe, expect, it } from 'vitest'
import type { Cue } from '../../drama/index.ts'
import { findWorkspace } from '../../engine/index.ts'
import {
  type StageSession,
  type StageStep,
  stageCommand,
  stageEdit,
  stageHint,
  stageRollback,
  stageTick,
  startStage,
} from '../stage.ts'
import { CALC, calcIsCorrect, FRIDAY_PUSH, PATHS, phaseOf } from './scenario.ts'

const now = { timestamp: 1_793_000_000, tzOffset: 540 }
const RESOLVED = `export function calcFee(amount: number): number {
  const rate = 0.036 // 2026/11 料金改定
  return Math.floor(amount * rate)
}
`

class Play {
  session: StageSession
  cues: Cue[] = []
  at = 0
  last: StageStep | null = null

  constructor() {
    const s = startStage(FRIDAY_PUSH, now, false)
    this.session = s.session
    this.cues.push(...s.cues)
  }

  run(command: string): StageStep {
    this.at += 5000
    const step = stageCommand(FRIDAY_PUSH, this.session, command, this.at, now, false)
    this.session = step.session
    this.cues.push(...step.cues)
    this.last = step
    return step
  }

  edit(content: string): void {
    this.session = stageEdit(this.session, CALC, content)
  }

  /** 手を止めて待つ（先輩の助け舟が出るまで） */
  idle(ms = 25_000): void {
    this.at += ms
    const step = stageTick(FRIDAY_PUSH, this.session, this.at, false)
    this.session = step.session
    this.cues.push(...step.cues)
  }

  phase(): string {
    return phaseOf(this.session.world, this.session.progress)
  }

  hint(): void {
    const step = stageHint(FRIDAY_PUSH, this.session, this.at, false)
    this.session = step.session
    this.cues.push(...step.cues)
  }

  rollback(): void {
    const step = stageRollback(FRIDAY_PUSH, this.session, this.at, false)
    this.session = step.session
    this.cues.push(...step.cues)
  }

  file(): string | undefined {
    return findWorkspace(this.session.world, PATHS.me)?.[1].files[CALC]
  }

  chats(): string[] {
    return this.cues.flatMap((c) => (c.type === 'chat' ? [c.key] : []))
  }
}

describe('金曜17:45、定時前の push', () => {
  it('初期状態：push すると拒否され、pull するとコンフリクトになる', () => {
    const p = new Play()
    expect(p.run('git push').result?.exitCode).toBe(1)
    expect(p.chats()).toContain('kouhai.error')
    const pulled = p.run('git pull')
    expect(pulled.result?.exitCode).toBe(1)
    expect(p.file()).toContain('<<<<<<< HEAD')
    expect(p.session.progress.milestones).toEqual(['pulledConflict'])
  })

  it('作者の解答手順で、par（5手）どおりにクリアし、ランク S', () => {
    const p = new Play()
    p.run('git push')
    p.run('git status')
    p.run('git pull')
    p.edit(RESOLVED)
    p.run(`git add ${CALC}`)
    p.run('git commit --no-edit')
    const pushed = p.run('git push')
    expect(pushed.session.cleared).toBe(true)
    expect(p.session.drama.moves).toBe(FRIDAY_PUSH.drama.par)
    expect(p.session.drama.finished?.rank).toBe('S')
    expect(p.chats()).toEqual(
      expect.arrayContaining([
        'milestone.pulledConflict',
        'milestone.resolvedBoth',
        'milestone.mergeCommitted',
        'ending.onTime',
        'ending.thanks',
        'kouhai.rank.S',
      ]),
    )
  })

  it('ゴールのチェック：最初は田中さんの分だけ。force push で入れ替わり、正しく解決すると両方つく', () => {
    const done = (p: Play) => FRIDAY_PUSH.goals(p.session.world).map((g) => g.done)
    const forced = new Play()
    expect(done(forced)).toEqual([false, true])
    forced.run('git push --force')
    expect(done(forced)).toEqual([true, false])

    const p = new Play()
    p.run('git pull')
    p.edit(RESOLVED)
    p.run('git add .')
    p.run('git commit --no-edit')
    expect(done(p)).toEqual([false, true]) // まだ push していない
    p.run('git push')
    expect(done(p)).toEqual([true, true])
    expect(p.session.cleared).toBe(true)
  })

  it('fetch して merge する手順でもクリアできる', () => {
    const p = new Play()
    p.run('git fetch')
    p.run('git merge origin/main')
    p.edit(RESOLVED)
    p.run('git add .')
    p.run('git commit --no-edit')
    expect(p.run('git push').session.cleared).toBe(true)
  })

  it('force push で押し切ると、田中さんのコミットが消えて始末書。チェックポイントに戻ってやり直せる', () => {
    const p = new Play()
    const forced = p.run('git push --force')
    expect(forced.cues).toContainEqual({ type: 'report', kind: 'FORCE_PUSH_OVERWROTE', level: 4 })
    expect(forced.session.cleared).toBe(false)
    expect(forced.session.checkpoint).not.toBeNull()

    p.rollback()
    expect(p.session.checkpoint).toBeNull()
    expect(p.chats()).toContain('senpai.rollback')
    // 戻った後は、ふつうに解決できる。ただし始末書をもらったので S にはならない
    p.run('git pull')
    p.edit(RESOLVED)
    p.run('git add .')
    p.run('git commit --no-edit')
    p.run('git push')
    expect(p.session.cleared).toBe(true)
    expect(p.session.drama.finished?.rank).not.toBe('S')
    expect(p.chats()).toContain('ending.afterReport')
  })

  it('「自分の変更を採用」で解消すると、田中さんの 0.036 が消えて、クリアにならない', () => {
    const p = new Play()
    p.run('git pull')
    p.edit(
      'export function calcFee(amount: number): number {\n  const rate = 0.035\n  return Math.floor(amount * rate)\n}\n',
    )
    p.run('git add .')
    expect(p.chats()).toContain('kouhai.lostRate')
    p.run('git commit --no-edit')
    p.run('git push')
    expect(p.session.cleared).toBe(false)
    expect(p.session.progress.milestones).not.toContain('resolvedBoth')
  })

  it('「取り込む変更を採用」で解消して push すると、部長に端数のことを言われる', () => {
    const p = new Play()
    p.run('git pull')
    p.edit(
      'export function calcFee(amount: number): number {\n  const rate = 0.036 // 2026/11 料金改定\n  return Math.round(amount * rate)\n}\n',
    )
    p.run('git add .')
    expect(p.chats()).toContain('kouhai.lostFloor')
    p.run('git commit --no-edit')
    p.run('git push')
    expect(p.chats()).toContain('boss.lostFloorPushed')
    expect(p.session.cleared).toBe(false)
  })

  it('印を残したままコミットすると、矢印が刺さる（Lv2）', () => {
    const p = new Play()
    p.run('git pull')
    p.run('git add .')
    const committed = p.run('git commit --no-edit')
    expect(committed.cues).toContainEqual({
      type: 'report',
      kind: 'CONFLICT_MARKER_COMMITTED',
      level: 2,
    })
  })

  it('補助チップに --force は出さない', () => {
    const p = new Play()
    const seen = new Set<string>()
    const collect = () => {
      for (const c of FRIDAY_PUSH.chips(p.session.world, p.session.progress)) seen.add(c.command)
    }
    collect()
    p.run('git push')
    collect()
    p.run('git pull')
    collect()
    p.edit(RESOLVED)
    p.run('git add .')
    collect()
    p.run('git commit --no-edit')
    collect()
    expect([...seen].some((c) => c.includes('--force'))).toBe(false)
    expect(seen).toContain('git pull')
  })

  it('解消後の calc.ts の判定', () => {
    expect(calcIsCorrect(RESOLVED)).toBe(true)
    expect(calcIsCorrect(RESOLVED.replace('0.036', '0.035'))).toBe(false)
    expect(calcIsCorrect(`<<<<<<< HEAD\n${RESOLVED}`)).toBe(false)
  })

  it('所要時間：見るだけなら0分、ふつうは1分、エラーは2分、ヒントは2分（docs/06 の 2.2）', () => {
    const p = new Play()
    p.run('git status')
    expect(p.session.drama.extraClockSec).toBe(0)
    p.run('git push') // 拒否される
    expect(p.session.drama.extraClockSec).toBe(120)
    p.run('git pull') // コンフリクトで終了コードは1なので、エラーと同じ2分
    expect(p.session.drama.extraClockSec).toBe(240)
    p.hint()
    expect(p.session.drama.extraClockSec).toBe(360)
    expect(p.chats().at(-1)).toBe('hint.resolve')
    expect(p.cues.some((c) => c.type === 'clock' && c.jumpedSec === 120)).toBe(true)
  })

  it('ヒントは、いまの状態に合わせて次の一手を言う', () => {
    const p = new Play()
    p.hint()
    expect(p.chats().at(-1)).toBe('hint.push')
    p.run('git push')
    p.hint()
    expect(p.chats().at(-1)).toBe('hint.pull')
    p.run('git pull')
    p.edit(RESOLVED)
    p.hint()
    expect(p.chats().at(-1)).toBe('hint.add')
    p.run(`git add ${CALC}`)
    p.hint()
    expect(p.chats().at(-1)).toBe('hint.commit')
    p.run('git commit --no-edit')
    p.hint()
    expect(p.chats().at(-1)).toBe('hint.pushAgain')
  })

  describe('間違えた後も、ヒントと先輩の助け舟で取り返せる', () => {
    /** 「自分の変更を採用」と同じ：田中さんの 0.036 が消える */
    const OURS = RESOLVED.replace('0.036 // 2026/11 料金改定', '0.035')

    it('片方を消したまま push しても、直すコミットを足せばクリアできる', () => {
      const p = new Play()
      p.run('git pull')
      p.edit(OURS)
      p.run(`git add ${CALC}`)
      p.run('git commit --no-edit')
      p.run('git push')
      expect(p.session.cleared).toBe(false)
      expect(p.chats()).toContain('senpai.afterWrongPush')
      expect(p.phase()).toBe('committedWrong')
      p.hint()
      expect(p.chats().at(-1)).toBe('hint.fixForward')

      p.edit(RESOLVED)
      expect(p.phase()).toBe('fixed')
      p.hint()
      expect(p.chats().at(-1)).toBe('hint.commitFix')
      p.run(`git add ${CALC}`)
      p.run('git commit -m "fix: 手数料率を3.6%に戻す"')
      p.run('git push')
      expect(p.session.cleared).toBe(true)
      // 田中さんの 0.036 が一度消えたので、お礼の言い方が変わり、先輩が「それで合ってる」と締める
      const endings = p.chats().filter((k) => k.startsWith('ending.'))
      expect(endings).toEqual(['ending.onTime', 'ending.thanksRecovered', 'ending.recovered'])
    })

    it('自分の切り捨てだけ消えて直したときは、田中さんのお礼はそのまま', () => {
      const p = new Play()
      p.run('git pull')
      p.edit(RESOLVED.replace('Math.floor', 'Math.round'))
      p.run(`git add ${CALC}`)
      p.run('git commit --no-edit')
      p.edit(RESOLVED)
      p.run(`git add ${CALC}`)
      p.run('git commit -m "fix: 端数を切り捨てに戻す"')
      p.run('git push')
      expect(p.session.cleared).toBe(true)
      const endings = p.chats().filter((k) => k.startsWith('ending.'))
      expect(endings).toEqual(['ending.onTime', 'ending.thanks', 'ending.recovered'])
    })

    it('押し切ったあとは、直したかどうかより始末書の結末を優先する', () => {
      const p = new Play()
      p.run('git push --force')
      p.rollback()
      p.run('git pull')
      p.edit(RESOLVED.replace('0.036 // 2026/11 料金改定', '0.035'))
      p.run(`git add ${CALC}`)
      p.run('git commit --no-edit')
      p.edit(RESOLVED)
      p.run(`git add ${CALC}`)
      p.run('git commit -m "fix: 手数料率を3.6%に戻す"')
      p.run('git push')
      expect(p.session.cleared).toBe(true)
      const endings = p.chats().filter((k) => k.startsWith('ending.'))
      expect(endings).toEqual(['ending.afterReport'])
    })

    it('解消を間違えたら、ヒントは直すか merge --abort でやり直すかを言う。abort して pull し直せる', () => {
      const p = new Play()
      p.run('git pull')
      p.edit(OURS)
      expect(p.phase()).toBe('conflictWrong')
      p.hint()
      expect(p.chats().at(-1)).toBe('hint.redo')
      p.run('git merge --abort')
      p.run('git pull')
      expect(p.phase()).toBe('conflict')
    })

    it('add した後に気づいても、直して add し直すよう言う', () => {
      const p = new Play()
      p.run('git pull')
      p.edit(OURS)
      p.run(`git add ${CALC}`)
      expect(p.phase()).toBe('mergeWrong')
      p.hint()
      expect(p.chats().at(-1)).toBe('hint.fixBeforeCommit')
    })

    it('手が止まると、先輩は「間違えた後」なら状態に合った声をかける', () => {
      const p = new Play()
      p.run('git pull')
      p.edit(OURS)
      p.run(`git add ${CALC}`)
      p.idle()
      expect(p.chats().at(-1)).toBe('senpai.idle.mistake')
    })

    it('HEAD がブランチから外れたら、main に戻るよう言う', () => {
      const p = new Play()
      const log = p.run('git log --oneline').result?.stdout ?? ''
      const mine = log.split('\n')[0]?.split(' ')[0] ?? ''
      p.run(`git checkout ${mine}`)
      expect(p.phase()).toBe('detached')
      p.idle()
      expect(p.chats().at(-1)).toBe('senpai.idle.detached')
      p.hint()
      expect(p.chats().at(-1)).toBe('hint.detached')
    })

    it('間違えたマージコミットは、push の前なら reset --hard ORIG_HEAD で取り消して、やり直せる', () => {
      const p = new Play()
      p.run('git push')
      p.run('git pull')
      p.edit(OURS)
      p.run(`git add ${CALC}`)
      p.run('git commit --no-edit')
      expect(p.phase()).toBe('committedWrong')
      p.run('git reset --hard ORIG_HEAD')
      expect(p.phase()).toBe('needPull')
      p.run('git pull')
      p.edit(RESOLVED)
      p.run(`git add ${CALC}`)
      p.run('git commit --no-edit')
      p.run('git push')
      expect(p.session.cleared).toBe(true)
      // 間違えたコミットは消したので、直したコミットを足したわけではない（ふつうの結末）
      expect(p.session.drama.reports).toEqual([])
    })

    it('コンフリクト中は checkout --theirs で取り込む側にしてから直せる。書きかけを捨てても危険ではない', () => {
      const p = new Play()
      p.run('git pull')
      p.edit('めちゃくちゃ\n')
      p.run(`git checkout --theirs ${CALC}`)
      expect(p.file()).toContain('0.036')
      p.edit(RESOLVED)
      p.run('git reset --hard')
      expect(p.session.drama.reports).toEqual([])
      expect(p.phase()).toBe('beforePush')
    })

    it('押し切ったら、チェックポイントかやり直しで戻るよう言う', () => {
      const p = new Play()
      p.run('git push --force')
      expect(p.phase()).toBe('forced')
      expect(p.chats()).not.toContain('senpai.afterWrongPush')
      p.hint()
      expect(p.chats().at(-1)).toBe('hint.forced')
    })
  })
})
