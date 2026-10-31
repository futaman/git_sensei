import { describe, expect, it } from 'vitest'
import type { FileState, GitDir, RepoView } from '../../../engine/index.ts'
import {
  appendPart,
  dropLastPart,
  type PaletteContext,
  paletteForEmpty,
  paletteForInput,
} from './palette.ts'

const git = (config: Record<string, string> = {}, merge = false) =>
  ({ bare: false, merge: merge ? {} : null, config }) as unknown as GitDir

const view = (branch: string | null, branches: string[], remoteBranches: string[] = []) =>
  ({
    branch,
    head: 'h',
    branches: branches.map((name) => ({ name, oid: name })),
    remoteBranches: remoteBranches.map((name) => ({ name, oid: name })),
    commits: [{ oid: 'h', short: 'abc1234', parents: [], subject: 's', author: 'a', timestamp: 0 }],
    mergingWith: null,
    conflicts: [],
  }) as RepoView

const file = (path: string, worktree: FileState['worktree'], staged: FileState['staged'] = null) =>
  ({ path, worktree, staged }) as FileState

const texts = (sections: ReturnType<typeof paletteForEmpty>, title?: string) =>
  sections
    .filter((s) => title === undefined || s.title === title)
    .flatMap((s) => s.parts.map((p) => p.text))

const base: PaletteContext = {
  git: git({ 'remote.origin.url': '/srv/x.git', 'branch.main.remote': 'origin' }),
  files: [file('README.md', 'clean'), file('src/a.ts', 'clean')],
  view: view('main', ['main'], ['origin/main']),
  servers: [],
  clonedChildren: [],
}

describe('paletteForEmpty', () => {
  it('リポジトリの外は clone と init', () => {
    const ctx: PaletteContext = { ...base, git: null, view: null, servers: ['/srv/x.git'] }
    expect(texts(paletteForEmpty(ctx), '動く')).toEqual(['git clone /srv/x.git', 'git init'])
  })

  it('何も変えていないときは、見るコマンドと pull / push', () => {
    const s = paletteForEmpty(base)
    expect(texts(s, '見る')).toEqual(['git status', 'git log --oneline', 'git diff', 'git show'])
    expect(texts(s, '動く').slice(0, 3)).toEqual(['git pull', 'git push', 'git fetch'])
    expect(texts(s, '動く')).not.toContain('git add')
  })

  it('変更があれば add、ステージにあれば commit', () => {
    const s = paletteForEmpty({
      ...base,
      files: [file('a', 'modified'), file('b', 'clean', 'M')],
    })
    expect(texts(s, '動く').slice(0, 5)).toEqual([
      'git add',
      'git diff',
      'git restore',
      'git commit',
      'git restore --staged',
    ])
  })

  it('push が弾かれたら、pull と並べて --force も出す（誘惑）。--force は danger', () => {
    const s = paletteForEmpty({ ...base, rejected: true })
    const act = s.find((x) => x.title === '動く')?.parts ?? []
    expect(act.map((p) => p.text).slice(0, 4)).toEqual([
      'git pull',
      'git fetch',
      'git push --force-with-lease',
      'git push --force',
    ])
    expect(act.find((p) => p.text === 'git push --force')?.danger).toBe(true)
    expect(act.find((p) => p.text === 'git push --force-with-lease')?.danger).toBeUndefined()
  })

  it('マージの途中はコンフリクトのファイルと abort', () => {
    const s = paletteForEmpty({
      ...base,
      git: git({}, true),
      files: [file('a', 'conflicted'), file('b', 'clean')],
    })
    expect(texts(s, 'マージ中')).toEqual([
      'git add a',
      'git commit --no-edit',
      'git merge --abort',
    ])
  })

  it('detached HEAD なら switch -c を先に', () => {
    const s = paletteForEmpty({ ...base, view: view(null, ['main']) })
    expect(texts(s, '動く')).toContain('git switch -c ')
  })
})

describe('paletteForInput', () => {
  it('空なら見る・動くの2段', () => {
    expect(paletteForInput('', base).map((s) => s.title)).toEqual(['見る', '動く'])
  })

  it('「git」だけならサブコマンド', () => {
    expect(texts(paletteForInput('git', base))).toEqual([
      'pull',
      'push',
      'fetch',
      'log',
      'switch',
      'branch',
      'reset',
      'rm',
    ])
  })

  it('add の後は変更のあるファイル。コンフリクトを先に', () => {
    const ctx = {
      ...base,
      files: [file('a', 'modified'), file('b', 'conflicted'), file('c', 'clean')],
    }
    expect(texts(paletteForInput('git add ', ctx))).toEqual(['b', 'a', '.'])
    // すでに入っている部品は出さない
    expect(texts(paletteForInput('git add b', ctx))).toEqual(['a', '.'])
  })

  it('commit の -m は引用符の中にカーソルを置く', () => {
    const ctx = { ...base, files: [file('a', 'clean', 'M')] }
    const parts = paletteForInput('git commit', ctx)[0]?.parts ?? []
    expect(parts[0]).toEqual({ text: '-m ""', cursorBack: 1 })
    // 引用符の中はキーボード
    expect(paletteForInput('git commit -m "fix', ctx)).toEqual([])
  })

  it('push は upstream がなければ -u origin <branch> を先に', () => {
    const ctx = { ...base, git: git({ 'remote.origin.url': '/srv/x.git' }) }
    expect(texts(paletteForInput('git push', ctx))[0]).toBe('-u origin main')
    expect(texts(paletteForInput('git push', base))).toEqual(['origin main'])
    expect(texts(paletteForInput('git push', { ...base, rejected: true }))).toEqual([
      '--force-with-lease',
      '--force',
      'origin main',
    ])
  })

  it('switch は他のブランチと -c。-c の後はキーボード', () => {
    const ctx = { ...base, view: view('main', ['main', 'feature']) }
    expect(texts(paletteForInput('git switch', ctx))).toEqual(['feature', '-c ', '-'])
    expect(paletteForInput('git switch -c ', ctx)).toEqual([])
  })

  it('reset の --hard は danger。ステージのファイルも出す', () => {
    const ctx = { ...base, files: [file('a', 'clean', 'M')] }
    const parts = paletteForInput('git reset', ctx)[0]?.parts ?? []
    expect(parts.map((p) => p.text)).toEqual([
      '--soft HEAD~1',
      'HEAD~1',
      '--hard HEAD~1',
      '--hard ORIG_HEAD',
      'a',
    ])
    expect(parts.filter((p) => p.danger).map((p) => p.text)).toEqual([
      '--hard HEAD~1',
      '--hard ORIG_HEAD',
    ])
  })

  it('restore --staged の後はステージのファイル', () => {
    const ctx = { ...base, files: [file('a', 'modified'), file('b', 'clean', 'M')] }
    expect(texts(paletteForInput('git restore', ctx))).toEqual(['--staged', '--source HEAD ', 'a'])
    expect(texts(paletteForInput('git restore --staged', ctx))).toEqual(['b'])
  })

  it('シェル：cd はディレクトリ、cat はファイル', () => {
    const ctx = { ...base, clonedChildren: ['app'] }
    expect(texts(paletteForInput('cd', ctx))).toEqual(['app', 'src', '..', '~'])
    expect(texts(paletteForInput('cat', ctx))).toEqual(['README.md', 'src/a.ts'])
  })

  it('知らないコマンドの続きは出さない', () => {
    expect(paletteForInput('git status', base)).toEqual([])
    expect(paletteForInput('echo', base)).toEqual([])
  })
})

describe('appendPart / dropLastPart', () => {
  it('空白で区切って足す', () => {
    expect(appendPart('', 'git add')).toBe('git add')
    expect(appendPart('git add ', 'README.md')).toBe('git add README.md')
    expect(appendPart('git switch', '-c ')).toBe('git switch -c ')
  })
  it('最後の語を消す', () => {
    expect(dropLastPart('git add README.md')).toBe('git add ')
    expect(dropLastPart('git add ')).toBe('git ')
    expect(dropLastPart('git')).toBe('')
  })
})
