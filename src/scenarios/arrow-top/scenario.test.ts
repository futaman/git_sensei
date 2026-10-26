import { describe, expect, it } from 'vitest'
import { Play } from '../play.test-helper.ts'
import { ARROW_TOP } from './scenario.ts'

const FIX = (p: Play) =>
  (p.file('src/pages/index.html') ?? '').replace(
    /<<<<<<< HEAD\n(.*)\n=======\n.*\n>>>>>>> feature\/english\n/,
    '$1\n',
  )

describe('2-3 トップページに矢印', () => {
  it('初期状態：origin の main に印が残っている', () => {
    const p = new Play(ARROW_TOP)
    expect(p.file('src/pages/index.html')).toContain('<<<<<<< HEAD')
    expect(p.goals()).toEqual([false, false])
  })

  it('直すコミットを足す。田中が先に push するので、pull してから push。5分以内なら早い結末', () => {
    const p = new Play(ARROW_TOP)
    p.run('ls src/pages')
    p.run('cat src/pages/index.html')
    expect(p.hintKey()).toBe('hint.fix')
    p.edit('src/pages/index.html', FIX(p))
    expect(p.file('src/pages/index.html')).toContain('冬のセール')
    expect(p.file('src/pages/index.html')).not.toContain('<<<<<<<')
    p.run('git add src/pages/index.html')
    p.run('git commit -m "fix: トップページに残ったコンフリクトの印を消す"')
    expect(p.chats()).toContain('kouhai.pushed')
    expect(p.npcLog.join('\n')).toContain('田中$ git push')
    expect(p.run('git push').result?.exitCode).toBe(1)
    expect(p.hintKey()).toBe('hint.pull')
    p.run('git pull --no-rebase')
    p.run('git push')
    expect(p.session.cleared).toBe(true)
    expect(p.endings()).toEqual(['ending.fast.kouhai', 'ending.fast.boss', 'ending.cost'])
    expect(p.texts().at(-2)).toBe('問い合わせ 6 件／対応コスト ¥7,200')
  })

  it('英語のほうを残すと、田中に気づかれる（ゴールは未達）', () => {
    const p = new Play(ARROW_TOP)
    p.edit(
      'src/pages/index.html',
      (p.file('src/pages/index.html') ?? '').replace(
        /<<<<<<< HEAD\n.*\n=======\n(.*)\n>>>>>>> feature\/english\n/,
        '$1\n',
      ),
    )
    p.run('git commit -am "fix: 印を消す"')
    p.run('git pull --no-rebase')
    p.run('git push')
    expect(p.chats()).toContain('kouhai.wrongLang')
    expect(p.session.cleared).toBe(false)
  })

  it('恥ずかしいコミットを amend して force push すると、田中のコミットも消える。チェックポイントに戻れる', () => {
    const p = new Play(ARROW_TOP)
    p.edit('src/pages/index.html', FIX(p))
    p.run('git add .')
    p.run('git commit --amend --no-edit')
    expect(p.chats()).toContain('senpai.noAmend')
    p.run('git push --force')
    expect(p.reports()).toContain('FORCE_PUSH_OVERWROTE')
    expect(p.session.checkpoint).not.toBeNull()
  })
})
