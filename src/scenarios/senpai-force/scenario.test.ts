import { describe, expect, it } from 'vitest'
import { Play } from '../play.test-helper.ts'
import { SENPAI_FORCE } from './scenario.ts'

describe('2-2 先輩の force push', () => {
  it('fetch して確かめ、pull で両方を合わせて push、直してから伝える（いちばん良い結末）', () => {
    const p = new Play(SENPAI_FORCE)
    p.run('git status')
    expect(p.chats()).toContain('kouhai.upToDate')
    expect(p.hintKey()).toBe('hint.fetch')
    p.run('git fetch')
    expect(p.chats()).toContain('milestone.fetched')
    const log = p.run('git log --oneline origin/feature/coupon').result?.stdout ?? ''
    expect(log).toContain('feat: クーポンの見た目')
    expect(log).not.toContain('fix: クーポンの期限切れ判定')
    p.run('git pull --no-rebase')
    expect(p.chats()).toContain('kouhai.askMerge')
    p.run('git log --oneline')
    p.run('git push')
    expect(p.goals()).toEqual([true, true, false])
    expect(p.session.cleared).toBe(false)
    p.choose('report.fixedAndAdvise')
    expect(p.session.cleared).toBe(true)
    expect(p.endings()).toEqual(['ending.A.senpai', 'ending.A.kouhai'])
    expect(p.rank()).toBe('S')
  })

  it('fetch 前の --force-with-lease は止めてくれる。fetch 後の lease は通ってしまい、先輩のコミットが消える', () => {
    const p = new Play(SENPAI_FORCE)
    const stopped = p.run('git push --force-with-lease')
    expect(stopped.result?.exitCode).toBe(1)
    expect(p.chats()).toContain('senpai.leaseStopped')
    p.run('git fetch')
    p.run('git push --force-with-lease')
    expect(p.reports()).toContain('FORCE_PUSH_OVERWROTE')
    expect(p.chats()).toContain('senpai.overwritten')
    expect(p.chats()).toContain('hint.lease')
    expect(p.session.checkpoint).not.toBeNull()
    p.rollback()
    p.run('git pull --no-rebase')
    p.run('git push')
    p.choose('report.fact')
    expect(p.session.cleared).toBe(true)
  })

  it('何も言わないと、翌週また消える（B まで）', () => {
    const p = new Play(SENPAI_FORCE)
    p.choose('report.silent')
    expect(p.choices()).toEqual([])
    p.run('git pull --no-rebase')
    p.run('git push')
    expect(p.session.cleared).toBe(true)
    expect(p.endings()).toEqual(['ending.C'])
    expect(['B', 'C', 'D']).toContain(p.rank())
  })
})
