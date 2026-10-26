import { describe, expect, it } from 'vitest'
import { Play } from '../play.test-helper.ts'
import { RELEASE_26 } from './scenario.ts'

describe('2-4 本日26時リリース', () => {
  it('rm --cached でゴミを外し、amend でメッセージも直して push。par 3 で S', () => {
    const p = new Play(RELEASE_26)
    expect(p.hintKey()).toBe('hint.look')
    p.run('git show --stat')
    expect(p.hintKey()).toBe('hint.rmCached')
    p.run('git rm -r --cached node_modules debug.log src/payment/calc.ts.bak memo.txt')
    expect(p.chats()).toContain('kouhai.smart')
    expect(p.file('debug.log')).toBeDefined()
    expect(p.hintKey()).toBe('hint.amend')
    p.run('git commit --amend -m "fix: 決済手数料の端数を切り捨てにする"')
    expect(p.hintKey()).toBe('hint.push')
    p.run('git push')
    expect(p.session.cleared).toBe(true)
    expect(p.goals()).toEqual([true, true, true])
    expect(p.endings()).toEqual(['ending.morning', 'ending.early'])
    expect(p.rank()).toBe('S')
  })

  it('reset HEAD~1（mixed）で取り消して、calc.ts だけ選び直してもよい', () => {
    const p = new Play(RELEASE_26)
    p.run('git reset HEAD~1')
    expect(p.hintKey()).toBe('hint.addCalc')
    p.run('git add src/payment/calc.ts')
    p.run('git commit -m "fix: 決済手数料の端数を切り捨てにする"')
    p.run('git push')
    expect(p.session.cleared).toBe(true)
  })

  it('reset --hard で修正まで消しても、reset --hard ORIG_HEAD で戻せる', () => {
    const p = new Play(RELEASE_26)
    p.run('git reset --hard HEAD~1')
    expect(p.chats()).toContain('kouhai.discarded')
    expect(p.hintKey()).toBe('hint.rescue')
    p.run('git reset --hard ORIG_HEAD')
    p.run('git rm -r --cached node_modules debug.log src/payment/calc.ts.bak memo.txt')
    p.run('git commit --amend -m "fix: 決済手数料の端数を切り捨てにする"')
    p.run('git push')
    expect(p.session.cleared).toBe(true)
    expect(p.endings()).toContain('ending.rescued.senpai')
  })

  it('memo.txt ごと出すと、隠しの結末', () => {
    const p = new Play(RELEASE_26)
    p.run('git rm -r --cached node_modules debug.log src/payment/calc.ts.bak')
    p.run('git commit --amend -m "fix: 決済手数料の端数を切り捨てにする"')
    p.run('git push')
    expect(p.session.cleared).toBe(true)
    expect(p.endings()).toContain('ending.memo')
  })

  it('そのまま push すると、作中18分かかって、翌朝に部長に見られる', () => {
    const p = new Play(RELEASE_26)
    p.run('git push')
    expect(p.session.drama.extraClockSec).toBe(18 * 60)
    expect(p.chats()).toContain('kouhai.slowPush2')
    expect(p.session.over).toBe(true)
    expect(p.endings()).toEqual(['ending.junk'])
    expect(p.rank()).toBe('D')
  })
})
