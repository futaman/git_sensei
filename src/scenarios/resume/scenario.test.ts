import { describe, expect, it } from 'vitest'
import { Play } from '../play.test-helper.ts'
import { RESUME_STAGE } from './scenario.ts'

describe('2-5 職務経歴書', () => {
  it('show --stat で見て、rm --cached → amend → push。ファイルは手元に残る。par 3 で S', () => {
    const p = new Play(RESUME_STAGE)
    expect(p.hintKey()).toBe('hint.look')
    const stat = p.run('git show --stat').result?.stdout ?? ''
    expect(stat).toContain('職務経歴書')
    expect(p.chats()).toContain('kouhai.saw')
    expect(p.hintKey()).toBe('hint.rmCached')
    p.run('git rm -r --cached 転職')
    expect(p.chats()).toContain('kouhai.smart')
    expect(p.file('転職/職務経歴書_2026.md')).toBeDefined()
    expect(p.hintKey()).toBe('hint.amend')
    p.run('git commit --amend --no-edit')
    p.run('git push')
    expect(p.session.cleared).toBe(true)
    expect(p.goals()).toEqual([true, true, true])
    // 田中には見られたので、最後にひとこと
    expect(p.endings()).toEqual(['ending.clean'])
    expect(p.chats().at(-2)).toBe('kouhai.saw')
  })

  it('--cached なしで消したら、amend の前なら restore --source HEAD で戻せる', () => {
    const p = new Play(RESUME_STAGE)
    p.run('git rm -r 転職')
    expect(p.chats()).toContain('kouhai.deletedFile')
    expect(p.file('転職/職務経歴書_2026.md')).toBeUndefined()
    expect(p.hintKey()).toBe('hint.restoreFile')
    p.run('git restore --source HEAD 転職')
    expect(p.chats()).toContain('milestone.restored')
    expect(p.file('転職/職務経歴書_2026.md')).toBeDefined()
    p.run('git commit --amend --no-edit')
    p.run('git push')
    expect(p.session.cleared).toBe(true)
    expect(p.endings()).toEqual(['ending.clean', 'ending.restored'])
  })

  it('reset --soft の後なら、ORIG_HEAD から戻せる', () => {
    const p = new Play(RESUME_STAGE)
    p.run('git reset --soft HEAD~1')
    p.run('git rm -r 転職')
    p.run('git commit -m "feat: 請求書を PDF で出力する"')
    expect(p.hintKey()).toBe('hint.restoreFromOrigHead')
    p.run('git restore --source ORIG_HEAD 転職')
    expect(p.file('転職/職務経歴書_2026.md')).toBeDefined()
    p.run('git push')
    expect(p.session.cleared).toBe(true)
  })

  it('消したまま amend すると戻せない。部長の pull が終わって、振り出しに戻る', () => {
    const p = new Play(RESUME_STAGE)
    p.run('git rm -r 転職')
    p.run('git commit --amend --no-edit')
    expect(p.hintKey()).toBe('hint.lostAfterAmend')
    p.run('git push')
    expect(p.session.cleared).toBe(false)
    p.wait(240_000)
    expect(p.session.over).toBe(true)
    expect(p.endings()).toEqual(['ending.clean', 'ending.hidden'])
    expect(p.rank()).toBe('D')
  })

  it('そのまま push すると、部長の pull で 1on1', () => {
    const p = new Play(RESUME_STAGE)
    p.run('git push')
    p.wait(240_000)
    expect(p.endings()).toEqual(['ending.leaked'])
    expect(p.rank()).toBe('D')
  })
})
