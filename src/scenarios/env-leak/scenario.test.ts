import { describe, expect, it } from 'vitest'
import { Play } from '../play.test-helper.ts'
import { ENV_LEAK } from './scenario.ts'

describe('3-2 .env が漏れた', () => {
  it('最初にキーを止め、pull → rm --cached → commit → push、田中に教える。S', () => {
    const p = new Play(ENV_LEAK)
    expect(p.hintKey()).toBe('hint.revoke')
    p.choose('revoke')
    expect(p.chats()).toContain('kouhai.revoked')
    expect(p.hintKey()).toBe('hint.pull')
    p.run('git pull')
    expect(p.hintKey()).toBe('hint.rmCached')
    p.run('git rm --cached .env')
    p.run('git commit -m "chore: .env を追跡から外す"')
    p.run('git push')
    expect(p.goals()).toEqual([true, true, false])
    p.choose('kouhai.teach')
    expect(p.session.cleared).toBe(true)
    expect(p.endings()).toEqual(['ending.revokeFirst', 'ending.taught'])
    expect(p.rank()).toBe('S')
  })

  it('git を先に触ってからキーを止めると、「消すより先に、止めろ」。S にはならない', () => {
    const p = new Play(ENV_LEAK)
    p.run('git pull')
    p.choose('revoke')
    p.run('git rm --cached .env')
    p.run('git commit -m "chore: .env を外す"')
    p.run('git push')
    p.choose('kouhai.cover')
    expect(p.endings()).toEqual(['ending.revokeLate'])
    expect(p.rank()).not.toBe('S')
  })

  it('作中1分でボットが知らせ、3分で早瀬が push してくる', () => {
    const p = new Play(ENV_LEAK)
    p.wait(11_000)
    expect(p.chats()).toContain('bot.detected')
    p.wait(20_000)
    expect(p.chats()).toContain('senpai.pushed')
    expect(p.npcLog.join('\n')).toContain('早瀬$ git push')
  })

  it('周知してからの --force-with-lease（早瀬の push の前）は危険にしない', () => {
    const p = new Play(ENV_LEAK)
    p.choose('revoke')
    p.choose('announce')
    p.run('git fetch')
    p.run('git push --force-with-lease')
    expect(p.reports()).toEqual([])
    expect(p.goals()[1]).toBe(true)
  })

  it('周知せずに force push すると、田中のコミットを消して始末書', () => {
    const p = new Play(ENV_LEAK)
    p.choose('revoke')
    p.run('git push --force')
    expect(p.reports()).toContain('FORCE_PUSH_OVERWROTE')
    expect(p.session.checkpoint).not.toBeNull()
  })

  it('締切までにキーを止めないと、Lv5 の結末', () => {
    const p = new Play(ENV_LEAK, true)
    p.wait(301_000)
    expect(p.session.over).toBe(true)
    expect(p.endings()).toEqual([
      'ending.noRevoke.boss',
      'ending.noRevoke.card',
      'ending.noRevoke.senpai',
    ])
  })
})
