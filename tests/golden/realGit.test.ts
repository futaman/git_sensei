// 突き合わせテストの土台：本物のgitの結果がどの環境でも同じになることを確かめる。
import { afterEach, describe, expect, it } from 'vitest'
import type { Step } from './harness.ts'
import { RealGitRepo } from './realGit.ts'

const firstCommit: Step[] = [
  { git: ['init'] },
  { write: ['README.md', 'hello\n'] },
  { git: ['add', 'README.md'] },
  { git: ['commit', '-m', 'first commit'] },
]

describe('RealGitRepo', () => {
  const repos: RealGitRepo[] = []
  const repo = () => {
    const r = new RealGitRepo()
    repos.push(r)
    return r
  }
  afterEach(() => {
    for (const r of repos.splice(0)) r.dispose()
  })

  it('作者・日時を固定すると、コミットのハッシュがいつも同じになる', () => {
    const a = repo().run(firstCommit).git('rev-parse', 'HEAD')
    const b = repo().run(firstCommit).git('rev-parse', 'HEAD')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{40}$/)
  })

  it('既定のブランチは main になる', () => {
    expect(repo().run(firstCommit).git('branch', '--show-current')).toBe('main')
  })
})
