import { describe, expect, it } from 'vitest'
import { Play } from '../play.test-helper.ts'
import { MONDAY_STANDUP } from './scenario.ts'

const FIXED_README = (p: Play) => (p.file('README.md') ?? '').replace('clnoe', 'clone')
const FIXED_CONTRIB = (p: Play, rule = 'コミットメッセージには、何をなぜ変えたかを書く') =>
  (p.file('CONTRIBUTING.md') ?? '').replace('コミットメッセージは自由', rule)

describe('1-2 月曜9:55、朝会の前に', () => {
  it('作者の解答手順：最初のコミットで部長が仕事を足し、amend でまとめて push。par 5 で S', () => {
    const p = new Play(MONDAY_STANDUP)
    expect(p.hintKey()).toBe('hint.edit')
    p.edit('README.md', FIXED_README(p))
    p.run('git add README.md')
    p.run('git commit -m "docs: README の clone の綴りを修正"')
    expect(p.chats()).toContain('boss.addMore')
    expect(p.goals()).toEqual([false, false])
    expect(p.hintKey()).toBe('hint.contrib')
    p.edit('CONTRIBUTING.md', FIXED_CONTRIB(p))
    expect(p.hintKey()).toBe('hint.amend')
    p.run('git add CONTRIBUTING.md')
    p.run('git commit --amend --no-edit')
    expect(p.chats()).toContain('kouhai.smart')
    p.run('git push')
    expect(p.session.cleared).toBe(true)
    expect(p.goals()).toEqual([true, true])
    expect(p.rank()).toBe('S')
    expect(p.texts()).toContain('"docs: README の clone の綴りを修正"。…読める。次')
  })

  it('「修正」で push すると、朝会で読み上げられて空気が止まる（B まで）', () => {
    const p = new Play(MONDAY_STANDUP)
    p.edit('README.md', FIXED_README(p))
    p.run('git add .')
    p.run('git commit -m 修正')
    expect(p.reports()).toContain('BAD_COMMIT_MESSAGE')
    p.edit('CONTRIBUTING.md', FIXED_CONTRIB(p))
    p.run('git add .')
    p.run('git commit -m "docs: CONTRIBUTING のメッセージの決まりを直す"')
    p.run('git push')
    expect(p.session.cleared).toBe(true)
    expect(p.endings()).toEqual(['ending.readBad', 'ending.readBadKouhai'])
    expect(['B', 'C', 'D']).toContain(p.rank())
  })

  it('push した後に amend すると拒否される。pull して取り込めば出せる', () => {
    const p = new Play(MONDAY_STANDUP)
    p.edit('README.md', FIXED_README(p))
    p.run('git add .')
    p.run('git commit -m "docs: README の綴りを直す"')
    p.run('git push')
    p.edit('CONTRIBUTING.md', FIXED_CONTRIB(p))
    p.run('git add .')
    p.run('git commit --amend --no-edit')
    expect(p.chats()).toContain('senpai.afterPushAmend')
    expect(p.run('git push').result?.exitCode).toBe(1)
    expect(p.hintKey()).toBe('hint.pull')
    p.run('git pull --no-rebase')
    p.run('git push')
    expect(p.session.cleared).toBe(true)
  })

  it('自分の言葉で CONTRIBUTING を書くと、隠しの結末', () => {
    const p = new Play(MONDAY_STANDUP)
    p.edit('README.md', FIXED_README(p))
    p.run('git add .')
    p.run('git commit -m "docs: README の綴りを直す"')
    p.edit(
      'CONTRIBUTING.md',
      FIXED_CONTRIB(p, '1行目に、変えた理由まで書く（半年後の自分のために）'),
    )
    p.run('git add .')
    p.run('git commit --amend --no-edit')
    p.run('git push')
    expect(p.endings()).toContain('ending.hidden.kouhai')
  })

  it('10時になっても出せていなければ、朝会が始まってしまう', () => {
    const p = new Play(MONDAY_STANDUP)
    p.wait(301_000)
    expect(p.chats()).toContain('ending.lateStandup')
    expect(p.session.over).toBe(false)
  })
})
