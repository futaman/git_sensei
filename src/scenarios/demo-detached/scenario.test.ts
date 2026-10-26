import { describe, expect, it } from 'vitest'
import { Play } from '../play.test-helper.ts'
import { DEMO_DETACHED } from './scenario.ts'

describe('2-1 デモ5分前', () => {
  it('status で detached に気づき、ブランチに乗せてから demo に取り込む。par 4 で S', () => {
    const p = new Play(DEMO_DETACHED)
    const st = p.run('git status').result?.stdout ?? ''
    expect(st).toMatch(/^HEAD detached from /)
    expect(p.hintKey()).toBe('hint.branch')
    p.run('git switch -c demo-fix')
    expect(p.chats()).toContain('milestone.onBranch')
    p.run('git switch demo')
    p.run('git merge demo-fix')
    p.run('git push')
    expect(p.session.cleared).toBe(true)
    expect(p.reports()).toEqual([])
    expect(p.endings()).toEqual(['ending.client', 'ending.onTime'])
    expect(p.rank()).toBe('S')
  })

  it('いきなり switch demo すると迷子。Warning のハッシュで救える', () => {
    const p = new Play(DEMO_DETACHED)
    const warn = p.run('git switch demo').result?.stderr ?? ''
    expect(warn).toContain('Warning: you are leaving 1 commit behind')
    expect(p.reports()).toContain('COMMITS_ORPHANED')
    expect(p.chats()).toContain('kouhai.orphaned')
    expect(p.hintKey()).toBe('hint.rescue')
    const hash = /git branch <new-branch-name> ([0-9a-f]+)/.exec(warn)?.[1] as string
    p.run(`git branch rescue ${hash}`)
    expect(p.chats()).toContain('milestone.rescued')
    p.run('git merge rescue')
    p.run('git push')
    expect(p.session.cleared).toBe(true)
    expect(p.endings()).toEqual(['ending.rescued', 'ending.onTime'])
  })

  it('待機室の人数が、作中1分ごとに増える', () => {
    const p = new Play(DEMO_DETACHED)
    expect(p.def.status?.(p.session.world, p.session.progress, 0)).toEqual([
      { label: '待機室', value: '1人', tone: 'normal' },
    ])
    p.wait(121_000)
    expect(p.texts()).toContain('待機室、3人になりました')
  })
})
