import { describe, expect, it } from 'vitest'
import { Play } from '../play.test-helper.ts'
import { PROTECTED_MAIN } from './scenario.ts'

describe('1-3 火曜14:00、今日から main は保護', () => {
  it('作者の解答手順：switch -c で変更ごと移り、push -u。エラーなしの結末で S', () => {
    const p = new Play(PROTECTED_MAIN)
    expect(p.hintKey()).toBe('hint.branch')
    p.run('git switch -c feature/receipt')
    expect(p.chats()).toContain('kouhai.smart')
    p.run('git add .')
    p.run('git commit -m "feat: レシートを発行できるようにする"')
    p.run('git push -u origin feature/receipt')
    expect(p.session.cleared).toBe(true)
    expect(p.endings()).toEqual(['ending.reviewCard', 'ending.review', 'ending.noError'])
    expect(p.rank()).toBe('S')
  })

  it('-u を忘れると、エラーに打つべきコマンドが出る', () => {
    const p = new Play(PROTECTED_MAIN)
    p.run('git switch -c feature/receipt')
    p.run('git add .')
    p.run('git commit -m "feat: レシート"')
    const r = p.run('git push')
    expect(r.result?.stderr).toContain('git push --set-upstream origin feature/receipt')
    expect(p.chats()).toContain('kouhai.noUpstream')
    p.run('git push --set-upstream origin feature/receipt')
    expect(p.session.cleared).toBe(true)
    expect(p.endings()).not.toContain('ending.noError')
  })

  it('main で commit してしまっても、push の前なら switch -c で逃がせる', () => {
    const p = new Play(PROTECTED_MAIN)
    p.run('git add .')
    p.run('git commit -m "feat: レシート"')
    expect(p.hintKey()).toBe('hint.rescue')
    p.run('git switch -c feature/receipt')
    expect(p.chats()).toContain('senpai.rescued')
    p.run('git push -u origin feature/receipt')
    expect(p.session.cleared).toBe(true)
  })

  it('main に直接 push すると始末書。ブランチで出し直してもランクは C まで', () => {
    const p = new Play(PROTECTED_MAIN)
    p.run('git add .')
    p.run('git commit -m "feat: レシート"')
    p.run('git push')
    expect(p.reports()).toContain('DIRECT_PUSH_TO_PROTECTED')
    p.run('git switch -c feature/receipt')
    p.run('git push -u origin feature/receipt')
    expect(p.endings()).toContain('ending.directPush')
    expect(['C', 'D']).toContain(p.rank())
  })

  it('14:15 にレビュー会が早まり、締切が 14:20 になる', () => {
    const p = new Play(PROTECTED_MAIN)
    p.wait(151_000)
    expect(p.chats()).toContain('boss.moveUp')
    expect(p.session.deadlineSec).toBe(20 * 60)
    p.wait(50_000)
    expect(p.cues.some((c) => c.type === 'deadline' && c.level === 'over')).toBe(true)
  })
})
