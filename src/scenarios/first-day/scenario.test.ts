import { describe, expect, it } from 'vitest'
import { Play } from '../play.test-helper.ts'
import { FIRST_DAY } from './scenario.ts'

describe('1-1 入社初日、犯人は log の中', () => {
  it('clone して log を読み、「とりあえず」（黒岩）を報告する。par 1 で S', () => {
    const p = new Play(FIRST_DAY)
    expect(p.hintKey()).toBe('hint.clone')
    expect(p.run('git clone https://git.example.com/shop-app.git').result?.exitCode).toBe(0)
    expect(p.hintKey()).toBe('hint.cd')
    p.run('cd shop-app')
    expect(p.choices()).toEqual([])
    const log = p.run('git log').result?.stdout ?? ''
    // 作者と時刻が読める
    expect(log).toContain('Author: 黒岩 <kuroiwa@example.com>')
    expect(log).toMatch(/23:41:00/)
    expect(p.choices()).toContain('answer.d4')
    p.choose('answer.d4')
    expect(p.session.cleared).toBe(true)
    expect(p.endings()).toEqual(['ending.bossConfess', 'ending.kouhaiWhisper', 'ending.welcome'])
    expect(p.rank()).toBe('S')
  })

  it('田中を犯人にすると、田中が落ち込む。答え直せる', () => {
    const p = new Play(FIRST_DAY)
    p.run('git clone https://git.example.com/shop-app.git')
    p.run('cd shop-app')
    p.run('git log --oneline')
    expect(p.chats()).toContain('kouhai.oneline')
    p.choose('answer.c3')
    expect(p.chats()).toContain('answer.wrong.kouhai')
    expect(p.session.over).toBe(false)
    expect(p.choices()).toContain('answer.c3')
    p.choose('answer.unknown')
    expect(p.chats()).toContain('answer.dontKnow.senpai')
    p.choose('answer.d4')
    expect(p.session.cleared).toBe(true)
    expect(p.rank()).not.toBe('S')
  })
})
