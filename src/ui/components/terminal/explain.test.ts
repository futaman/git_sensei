import { describe, expect, it } from 'vitest'
import { explain } from './explain.ts'

describe('explain', () => {
  it('空のメッセージでコミットが中止されたことを伝える', () => {
    expect(explain('git commit -m ""', 'Aborting commit due to empty commit message.\n')).toMatch(
      /メッセージが空/,
    )
  })

  it('コマンドの条件があるものは、そのコマンドのときだけ', () => {
    expect(explain('git push', 'Everything up-to-date\n')).toMatch(/送る新しいコミット/)
    expect(explain('git fetch', 'Everything up-to-date\n')).toBeNull()
  })

  it('当てはまらなければ null', () => {
    expect(
      explain('git status', 'On branch main\nnothing to commit, working tree clean\n'),
    ).toBeNull()
  })
})
