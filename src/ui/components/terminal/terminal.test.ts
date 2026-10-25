import { describe, expect, it } from 'vitest'
import { complete } from './completion.ts'

const names = { branches: ['feature', 'fix-bug', 'main'], files: ['README.md', 'src/app.js'] }

describe('complete', () => {
  it('最初の単語', () => {
    expect(complete('gi', names)).toEqual({ input: 'git ', candidates: [] })
  })

  it('サブコマンド', () => {
    expect(complete('git com', names)).toEqual({ input: 'git commit ', candidates: [] })
    expect(complete('git s', names)).toEqual({ input: 'git s', candidates: ['status', 'switch'] })
  })

  it('ブランチ名は共通部分まで補い、候補を返す', () => {
    expect(complete('git switch f', names)).toEqual({
      input: 'git switch f',
      candidates: ['feature', 'fix-bug'],
    })
    expect(complete('git switch fe', names)).toEqual({
      input: 'git switch feature ',
      candidates: [],
    })
  })

  it('add はファイル名', () => {
    expect(complete('git add src', names)).toEqual({ input: 'git add src/app.js ', candidates: [] })
  })

  it('オプション', () => {
    expect(complete('git log --on', names)).toEqual({ input: 'git log --oneline ', candidates: [] })
  })

  it('候補がなければそのまま', () => {
    expect(complete('git commit -m x', names)).toEqual({ input: 'git commit -m x', candidates: [] })
  })
})
