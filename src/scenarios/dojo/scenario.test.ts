import { describe, expect, it } from 'vitest'
import { Play } from '../play.test-helper.ts'
import { DOJO } from './scenario.ts'

describe('外伝 やらかし道場', () => {
  it('10枠すべてを埋められる（図鑑が完成すると部長が締める）', () => {
    const p = new Play(DOJO)
    // 1・2・8：.env と node_modules を add して「fix」で commit し、shared に push
    p.run('git switch shared')
    p.run('git add node_modules .env')
    p.run('git commit -m fix')
    p.run('git push')
    // 6：shared を amend して force push（自分のコミットだけが消える）
    p.run('git commit --amend -m "docs: 秘密のメモ"')
    p.run('git push --force')
    p.run('git switch main')
    // 7：fetch せずに main へ force push（田中のコミットが消える）
    p.run('git push --force')
    // 3：conflict-me をマージして、印のまま commit
    p.run('git merge conflict-me')
    p.run('git add .')
    p.run('git commit --no-edit')
    // 5：保護された main に直接 push
    p.run('git push')
    // 4：detached HEAD で commit して置き去り
    p.run('git switch --detach HEAD')
    p.run('git commit --allow-empty -m "迷子になるコミット"')
    p.run('git switch main')
    // 9：書きかけをまとめて捨てる
    p.edit('README.md', '書きかけ\n')
    p.run('git reset --hard')
    // 10：家ごと消す
    p.run('rm -rf .git')
    expect(p.goals().slice(0, 10)).toEqual(Array(10).fill(true))
    expect(p.session.cleared).toBe(true)
    expect(p.endings()).toEqual([])
    expect(p.chats()).toContain('boss.complete')
    // 1手目から3手目までで3種類（JUNK・BAD・SECRET）が出たので役満
    expect(p.goals()[10]).toBe(true)
    expect(p.chats()).toContain('senpai.yakuman')
  })

  it('損害額と称号がヘッダーに出る。称号が上がると先輩が知らせる', () => {
    const p = new Play(DOJO)
    expect(p.def.status?.(p.session.world, p.session.progress, 0)).toEqual([
      { label: '損害額', value: '¥0', tone: 'normal' },
      { label: '称号', value: '見習い' },
      { label: '図鑑', value: '0/10' },
    ])
    p.run('git add .env')
    p.run('git commit -m "chore: 設定"')
    p.run('git push --force')
    const st = p.def.status?.(p.session.world, p.session.progress, 0) ?? []
    expect(st[2]?.value).toBe('2/10')
    expect(p.texts()).toContain('称号：伝説の人')
  })

  it('「道場を元に戻す」で world だけ戻る。図鑑は残る', () => {
    const p = new Play(DOJO)
    p.run('rm -rf .git')
    expect(p.goals()[9]).toBe(true)
    p.resetWorld()
    expect(p.session.world.workspaces[p.session.cwd]?.git).not.toBeNull()
    expect(p.goals()[9]).toBe(true)
    expect(p.chats()).toContain('senpai.reset')
  })

  it('ヒントは、次に埋める枠の答え', () => {
    const p = new Play(DOJO)
    expect(p.hintKey()).toBe('hint.BAD_COMMIT_MESSAGE')
  })
})
