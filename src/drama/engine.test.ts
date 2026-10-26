import { describe, expect, it } from 'vitest'
import { clockText } from './clock.ts'
import { initDrama, stepDrama } from './engine.ts'
import { trustStageWithHysteresis } from './stages.ts'
import type { Cue, DangerSignal, DramaInput, DramaSettings, DramaState } from './types.ts'

const base: DramaSettings = {
  mode: 'practice',
  cast: ['kouhai', 'boss'],
  par: 3,
  untimed: false,
  seed: 42,
}

/** 1回のコマンドの入力を作る。hash は状態の代わりの文字列 */
const cmd = (
  at: number,
  command: string,
  hash: string,
  extra: Partial<Extract<DramaInput, { type: 'command' }>> = {},
): DramaInput => ({
  type: 'command',
  at,
  command,
  exitCode: 0,
  unsupported: false,
  events: [],
  stateHash: hash,
  milestones: [],
  dangers: [],
  ...extra,
})

function play(inputs: DramaInput[], settings: DramaSettings = base) {
  let { state, cues } = initDrama(settings, 'h0')
  const all: Cue[][] = [cues]
  for (const input of inputs) {
    const r = stepDrama(state, input, settings)
    state = r.state
    all.push(r.cues)
  }
  return { state, cues: all, last: all[all.length - 1] as Cue[] }
}

const chats = (cues: Cue[]) =>
  cues.filter((c): c is Extract<Cue, { type: 'chat' }> => c.type === 'chat').map((c) => c.key)

describe('操作の分類と後輩の信頼', () => {
  it('確認（status など）は減点しない', () => {
    const { state } = play([cmd(1000, 'git status', 'h0'), cmd(2000, 'git log --oneline', 'h0')])
    expect(state.trust).toBe(80)
    expect(state.moves).toBe(0)
  })

  it('状態が変わらないコマンドは空振り（−4）', () => {
    const { state, last } = play([cmd(1000, 'git switch main', 'h0')])
    expect(state.lastCategory).toBe('noop')
    expect(state.trust).toBe(76)
    expect(chats(last)).toEqual(['kouhai.noop'])
  })

  it('一度通った状態に戻るのは後退（−6）。続くとセリフがきつくなる', () => {
    const { state, cues } = play([
      cmd(1000, 'git add a.txt', 'h1'),
      cmd(2000, 'git restore --staged a.txt', 'h0'),
      cmd(3000, 'git add a.txt', 'h1'),
    ])
    expect(state.trust).toBe(80 - 6 - 6)
    const regressLines = cues
      .flat()
      .filter((c) => c.type === 'chat' && c.key === 'kouhai.regress')
      .map((c) => (c as { text: string }).text)
    expect(regressLines).toEqual(['あれ？', '先輩、それさっきも…'])
  })

  it('エラーは続くほど大きく減る（−3, −6）', () => {
    const { state } = play([
      cmd(1000, 'git switch nope', 'h0', { exitCode: 128 }),
      cmd(2000, 'git switch nope2', 'h0', { exitCode: 128 }),
    ])
    expect(state.trust).toBe(80 - 3 - 6)
    expect(state.moves).toBe(2)
  })

  it('同じ確認を状態が変わらないまま3回目から減点する', () => {
    const { state } = play([
      cmd(1000, 'git status', 'h0'),
      cmd(2000, 'git status', 'h0'),
      cmd(3000, 'git status', 'h0'),
      cmd(4000, 'git  status', 'h0'),
    ])
    expect(state.trust).toBe(80 - 2 - 2)
  })

  it('マイルストーンで前進（+5）、スマート解は1回だけ（+8）', () => {
    const settings = { ...base, smartMoves: [{ id: 'switch-c', pattern: 'git switch -c' }] }
    const { state } = play(
      [
        cmd(1000, 'git switch -c feature', 'h1', { milestones: ['branch'] }),
        cmd(2000, 'git switch main', 'h2'),
        cmd(3000, 'git switch -c other', 'h3'),
      ],
      settings,
    )
    expect(state.trust).toBe(Math.min(100, 80 + 8 + 5))
  })

  it('シミュレータの未対応は減点も手数もなし', () => {
    const { state } = play([cmd(1000, 'git rebase main', 'h0', { unsupported: true, exitCode: 1 })])
    expect(state.trust).toBe(80)
    expect(state.moves).toBe(0)
  })

  it('後輩がいない場面では信頼は動かない', () => {
    const { state, last } = play([cmd(1000, 'git switch main', 'h0')], { ...base, cast: ['boss'] })
    expect(state.trust).toBe(80)
    expect(chats(last)).toEqual([])
  })
})

describe('危険な操作と上司の機嫌', () => {
  const force: DangerSignal = { kind: 'FORCE_PUSH_OVERWROTE', allowed: false, detail: '後輩 田中' }

  it('致命的な危険：機嫌が大きく下がり、激怒カットインと始末書', () => {
    const { state, last } = play([cmd(1000, 'git push --force', 'h1', { dangers: [force] })])
    expect(state.mood).toBe(5)
    expect(state.trust).toBe(65)
    expect(state.dangers).toBe(1)
    expect(last).toContainEqual({ type: 'report', kind: 'FORCE_PUSH_OVERWROTE', level: 4 })
    expect(last).toContainEqual({ type: 'cutin', who: 'boss', variant: 'rage' })
    expect(last).toContainEqual({ type: 'mood', stage: 'boiling' })
  })

  it('始末書は同じ種類では1枚だけ。機嫌が0になると雷', () => {
    const { state, last } = play([
      cmd(1000, 'git push --force', 'h1', { dangers: [force] }),
      cmd(2000, 'git push --force', 'h2', { dangers: [force] }),
    ])
    expect(state.reports).toEqual(['FORCE_PUSH_OVERWROTE'])
    expect(state.thunder).toBe(true)
    expect(last.filter((c) => c.type === 'report')).toEqual([])
    expect(last).toContainEqual({ type: 'cutin', who: 'boss', variant: 'thunder' })
    expect(last).toContainEqual({ type: 'shake', intensity: 3 })
  })

  it('許可された危険は減点しない。直前に確認していれば +3', () => {
    const { state } = play([
      cmd(1000, 'git status', 'h0'),
      cmd(2000, 'git push --force-with-lease', 'h1', { dangers: [{ ...force, allowed: true }] }),
    ])
    expect(state.mood).toBe(50)
    expect(state.trust).toBe(83)
    expect(state.dangers).toBe(0)
  })

  it('軽い危険は小言だけ（揺れない）', () => {
    const { state, last } = play([
      cmd(1000, 'git commit -m 修正', 'h1', {
        dangers: [{ kind: 'BAD_COMMIT_MESSAGE', allowed: false }],
      }),
    ])
    expect(state.mood).toBe(45)
    expect(last.some((c) => c.type === 'shake')).toBe(false)
    expect(chats(last)).toContain('boss.danger.BAD_COMMIT_MESSAGE')
  })

  it('チャットの選択肢の効果', () => {
    const settings = { ...base, choices: [{ id: 'report', mood: 10, trust: 3 }] }
    const { state } = play([{ type: 'choice', at: 1000, id: 'report' }], settings)
    expect(state.mood).toBe(60)
    expect(state.trust).toBe(83)
  })
})

describe('時間', () => {
  it('手が止まると、20秒で「…」、45秒から30秒ごとに −2', () => {
    const { state, cues } = play([
      { type: 'tick', at: 21_000 },
      { type: 'tick', at: 46_000 },
      { type: 'tick', at: 80_000 },
    ])
    const typing = cues.flat().filter((c) => c.type === 'typing')
    expect(typing).toEqual([
      { type: 'typing', who: 'kouhai', vanish: false },
      { type: 'typing', who: 'kouhai', vanish: true },
      { type: 'typing', who: 'kouhai', vanish: true },
    ])
    expect(state.trust).toBe(76)
  })

  it('コマンドを打つと手が止まった数え直し', () => {
    const { state } = play([
      { type: 'tick', at: 46_000 },
      cmd(50_000, 'git status', 'h0'),
      { type: 'tick', at: 60_000 },
    ])
    expect(state.trust).toBe(78)
  })

  it('期限：残り30%で強調、10%で催促、過ぎたら10秒ごとに機嫌 −2', () => {
    const settings = { ...base, deadlineSec: 100 }
    const { state, cues } = play(
      [
        { type: 'tick', at: 75_000 },
        { type: 'tick', at: 131_000 },
      ],
      settings,
    )
    const deadline = cues.flat().filter((c) => c.type === 'deadline')
    expect(deadline).toEqual([
      { type: 'deadline', level: 'warning' },
      { type: 'deadline', level: 'urgent' },
      { type: 'deadline', level: 'over' },
    ])
    expect(state.mood).toBe(50 - 2 * 3)
  })

  it('時間制限なしモードでは、時間による減点がない', () => {
    const settings = { ...base, deadlineSec: 100, untimed: true }
    const { state, cues } = play([{ type: 'tick', at: 500_000 }], settings)
    expect(state.trust).toBe(80)
    expect(state.mood).toBe(50)
    // 手が止まったことへの気づき（減点なし）は出すが、期限と「入力中…が消える」減点は出さない
    expect(
      cues.flat().filter((c) => c.type === 'deadline' || (c.type === 'typing' && c.vanish)),
    ).toEqual([])
  })

  it('作中の時計（24時を過ぎても数え続ける）', () => {
    expect(clockText({ clockStart: '17:45' }, 15 * 60 * 1000)).toBe('18:00')
    expect(clockText({ clockStart: '23:50', clockScale: 60 }, 30 * 1000)).toBe('24:20')
  })
})

describe('ランク', () => {
  const finish = (at: number): DramaInput => ({ type: 'finish', at })

  it('S：手数 ≤ par、危険なし、信頼85以上、期限内', () => {
    const settings = { ...base, initialTrust: 90, deadlineSec: 100 }
    const { state, last } = play(
      [cmd(1000, 'a', 'h1'), cmd(2000, 'b', 'h2'), cmd(3000, 'c', 'h3'), finish(4000)],
      settings,
    )
    expect(state.finished).toEqual({ rank: 'S', slow: false })
    expect(last).toContainEqual({ type: 'cutin', who: 'kouhai', variant: 'sparkle' })
    expect(state.mood).toBeGreaterThan(50)
  })

  it('手数が多いと A → B → C', () => {
    const moves = (n: number) =>
      Array.from({ length: n }, (_, i) => cmd(i * 1000, `x${i}`, `h${i + 1}`))
    const rankOf = (n: number) => play([...moves(n), finish(99_000)]).state.finished?.rank
    expect(rankOf(5)).toBe('A')
    expect(rankOf(8)).toBe('B')
    expect(rankOf(9)).toBe('C')
  })

  it('信頼が25未満なら、解決しても D', () => {
    const { state } = play([finish(1000)], { ...base, initialTrust: 20 })
    expect(state.finished?.rank).toBe('D')
  })

  it('時間制限なしでクリアすると「ゆっくり」の印', () => {
    const { state } = play([finish(1000)], { ...base, untimed: true, initialTrust: 90 })
    expect(state.finished).toEqual({ rank: 'S', slow: true })
  })

  it('終わった後の入力は無視する', () => {
    const { state } = play([finish(1000), cmd(2000, 'git switch main', 'h0')])
    expect(state.trust).toBe(80)
  })
})

describe('表情と決定性', () => {
  it('表情は境目から3ポイント離れるまで変えない', () => {
    expect(trustStageWithHysteresis('expect', 64)).toBe('expect')
    expect(trustStageWithHysteresis('expect', 62)).toBe('worry')
    expect(trustStageWithHysteresis('worry', 66)).toBe('worry')
    expect(trustStageWithHysteresis('worry', 68)).toBe('expect')
    expect(trustStageWithHysteresis('expect', 10)).toBe('void')
  })

  it('同じ設定・同じ入力なら、いつも同じキュー（リプレイできる）', () => {
    const inputs = [
      cmd(1000, 'git switch main', 'h0'),
      cmd(2000, 'git switch main', 'h0'),
      cmd(3000, 'git add a', 'h1'),
      { type: 'tick', at: 90_000 } as DramaInput,
    ]
    expect(play(inputs).cues).toEqual(play(inputs).cues)
  })

  it('状態は JSON にしても同じ（保存してから続きを再生できる）', () => {
    const { state } = play([cmd(1000, 'git add a', 'h1'), cmd(2000, 'git status', 'h1')])
    const restored = JSON.parse(JSON.stringify(state)) as DramaState
    const next = cmd(3000, 'git add a', 'h1')
    expect(stepDrama(restored, next, base)).toEqual(stepDrama(state, next, base))
  })
})

describe('シナリオ向けの機能（docs/06）', () => {
  it('コマンドの所要時間で作中の時計が飛び、期限も近づく', () => {
    const settings = { ...base, deadlineSec: 100, clockStart: '17:45', clockScale: 3 }
    const { state, last } = play([cmd(10_000, 'git push', 'h1', { durationSec: 240 })], settings)
    expect(state.extraClockSec).toBe(240)
    expect(last).toContainEqual({ type: 'clock', jumpedSec: 240, extraSec: 240 })
    // 実時間10秒（作中30秒）＋飛んだ240秒 → 17:49
    expect(clockText(settings, 10_000, state.extraClockSec)).toBe('17:49')
    // 作中240秒 ＝ 実時間80秒ぶん期限が近づく：10 + 80 = 90秒 → 残り10% で urgent
    expect(state.deadlineLevel).toBe('none')
    const later = stepDrama(state, { type: 'tick', at: 11_000 }, settings)
    expect(later.state.deadlineLevel).toBe('urgent')
  })

  it('シナリオからのセリフ（note）は、信頼・機嫌も動かせる', () => {
    const { state, last } = play([
      { type: 'note', at: 1000, from: 'kouhai', key: 'kouhai.noop', trust: -3 },
    ])
    expect(state.trust).toBe(77)
    expect(chats(last)).toEqual(['kouhai.noop'])
  })

  it('手が止まると先輩が助け舟を出し、回数ごとに方向をはっきりさせていく', () => {
    const settings: DramaSettings = {
      ...base,
      cast: ['kouhai', 'boss', 'senpai'],
      idleHelper: true,
      lines: { 'senpai.idle': ['ヒント1', 'ヒント2', 'ヒント3'] },
    }
    const { cues } = play(
      [{ type: 'tick', at: 21_000 }, cmd(30_000, 'git status', 'h0'), { type: 'tick', at: 51_000 }],
      settings,
    )
    const hints = cues
      .flat()
      .filter((c) => c.type === 'chat' && c.from === 'senpai')
      .map((c) => (c as { text: string }).text)
    expect(hints).toEqual(['ヒント1', 'ヒント2'])
  })

  it('シナリオが助け舟の key を渡せば、そちらを言う（間違えた後の声かけ）', () => {
    const settings: DramaSettings = {
      ...base,
      cast: ['kouhai', 'boss', 'senpai'],
      idleHelper: true,
      lines: { 'senpai.idle.mistake': ['もう一回よく見てみ'] },
    }
    const { cues } = play(
      [{ type: 'tick', at: 21_000, helperKey: 'senpai.idle.mistake' }],
      settings,
    )
    const senpai = cues.flat().filter((c) => c.type === 'chat' && c.from === 'senpai')
    expect(senpai).toEqual([expect.objectContaining({ key: 'senpai.idle.mistake' })])
  })

  it('結末はシナリオが差し替え・追加できる。始末書があるときは追加しない', () => {
    const cast: DramaSettings['cast'] = ['kouhai', 'boss', 'senpai']
    const finish = {
      type: 'finish' as const,
      at: 1000,
      replace: { 'ending.thanks': 'ending.thanksRecovered' },
      epilogue: [{ from: 'senpai' as const, key: 'ending.recovered' }],
    }
    const lines = {
      'ending.thanksRecovered': ['戻ってよかったです'],
      'ending.recovered': ['それで合ってる'],
    }
    const { last } = play([finish], { ...base, cast, deadlineSec: 100, lines })
    expect(chats(last).slice(0, 3)).toEqual([
      'ending.onTime',
      'ending.thanksRecovered',
      'ending.recovered',
    ])
  })

  it('マイルストーンごとのセリフがあれば、そちらを使う', () => {
    const settings = { ...base, lines: { 'milestone.pulled': ['ぶつかった…'] } }
    const { last } = play([cmd(1000, 'git pull', 'h1', { milestones: ['pulled'] })], settings)
    expect(chats(last)).toEqual(['milestone.pulled'])
  })

  it('結末：期限内なら部長→後輩、始末書があれば先輩、遅れたら部長', () => {
    const cast: DramaSettings['cast'] = ['kouhai', 'boss', 'senpai']
    const onTime = play([{ type: 'finish', at: 1000 }], { ...base, cast, deadlineSec: 100 })
    expect(chats(onTime.last)).toEqual(['ending.onTime', 'ending.thanks', 'kouhai.rank.A'])
    const late = play([{ type: 'finish', at: 200_000 }], { ...base, cast, deadlineSec: 100 })
    expect(chats(late.last)).toContain('ending.late')
    expect(chats(late.last)).not.toContain('ending.onTime')
    const reported = play(
      [
        cmd(1000, 'git push --force', 'h1', {
          dangers: [{ kind: 'FORCE_PUSH_OVERWROTE', allowed: false }],
        }),
        { type: 'finish', at: 2000 },
      ],
      { ...base, cast, deadlineSec: 100 },
    )
    expect(chats(reported.last)[0]).toBe('ending.afterReport')
  })

  it('始末書のヤバ度は、信号の level があればそれを使う', () => {
    const { last } = play([
      cmd(1000, 'git push', 'h1', {
        dangers: [{ kind: 'CONFLICT_MARKER_COMMITTED', allowed: false, level: 3 }],
      }),
    ])
    expect(last).toContainEqual({ type: 'report', kind: 'CONFLICT_MARKER_COMMITTED', level: 3 })
  })
})
