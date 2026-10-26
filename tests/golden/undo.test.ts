// 取り消しと確認のコマンド：checkout / restore（ファイルを戻す）、reset、diff、show、rm、mv
import { describe, it } from 'vitest'
import { expectSameAsRealGit, type Step } from './harness.ts'

const out = ['stdout'] as ('stdout' | 'stderr')[]
const both = ['stdout', 'stderr'] as ('stdout' | 'stderr')[]

/** 2つのコミットがあるリポジトリ（a.txt と b.txt） */
const twoCommits: Step[] = [
  { git: ['init'] },
  { write: ['a.txt', 'a1\n'] },
  { write: ['b.txt', 'b1\n'] },
  { git: ['add', '.'] },
  { git: ['commit', '-m', 'first'] },
  { write: ['a.txt', 'a2\n'] },
  { write: ['c.txt', 'c\n'] },
  { git: ['add', '.'] },
  { git: ['commit', '-m', 'second'] },
]

/** main と feature が story.txt の同じ行を変えて、マージでコンフリクトしたところ */
const conflicted: Step[] = [
  { git: ['init'] },
  { write: ['story.txt', 'line 1\nline 2\nline 3\n'] },
  { git: ['add', '.'] },
  { git: ['commit', '-m', 'base'] },
  { git: ['switch', '-c', 'feature'] },
  { write: ['story.txt', 'line 1\nline 2 by feature\nline 3\n'] },
  { git: ['commit', '-am', 'feature'] },
  { git: ['switch', 'main'] },
  { write: ['story.txt', 'line 1\nline 2 by main\nline 3\n'] },
  { git: ['commit', '-am', 'main'] },
  { git: ['merge', 'feature'] },
]

describe('git checkout でファイルを戻す', () => {
  it('-- のあり・なしで、作業ツリーの変更を index の内容に戻す', () => {
    expectSameAsRealGit([
      ...twoCommits,
      { write: ['a.txt', 'oops\n'] },
      { write: ['b.txt', 'oops\n'] },
      { git: ['checkout', '--', 'a.txt'], compare: both },
      { git: ['checkout', 'b.txt'], compare: both },
    ])
  })

  it('ステージ済みの内容は残り、作業ツリーだけが index に戻る', () => {
    expectSameAsRealGit([
      ...twoCommits,
      { write: ['a.txt', 'staged\n'] },
      { git: ['add', 'a.txt'] },
      { write: ['a.txt', 'more\n'] },
      { git: ['checkout', '.'], compare: both },
    ])
  })

  it('コミットを指定すると、index も作業ツリーもその内容になる', () => {
    expectSameAsRealGit([
      ...twoCommits,
      { git: ['checkout', 'HEAD~1', '--', 'a.txt'], compare: both },
      { git: ['status'], compare: out },
      { git: ['checkout', 'HEAD', 'a.txt', 'b.txt'], compare: both },
    ])
  })

  it('知らないファイルはエラー', () => {
    expectSameAsRealGit([...twoCommits, { git: ['checkout', '--', 'nope.txt'], compare: both }])
  })

  it('コンフリクト中：--ours / --theirs でどちらかの内容にする。指定なしはエラー', () => {
    expectSameAsRealGit([
      ...conflicted,
      { git: ['checkout', '--', 'story.txt'], compare: both },
      { git: ['checkout', '--theirs', 'story.txt'], compare: both },
      { check: true },
      { git: ['checkout', '--ours', '--', 'story.txt'], compare: both },
      { git: ['add', 'story.txt'] },
      { git: ['commit', '--no-edit'] },
    ])
  })
})

describe('git restore', () => {
  it('作業ツリーの変更を捨てる。--staged でステージから降ろす', () => {
    expectSameAsRealGit([
      ...twoCommits,
      { write: ['a.txt', 'oops\n'] },
      { git: ['restore', 'a.txt'], compare: both },
      { write: ['b.txt', 'staged\n'] },
      { git: ['add', 'b.txt'] },
      { git: ['restore', '--staged', 'b.txt'], compare: both },
      { git: ['status', '--short'], compare: out },
    ])
  })

  it('新しく add したファイルを --staged で降ろすと、未追跡に戻る', () => {
    expectSameAsRealGit([
      ...twoCommits,
      { write: ['new.txt', 'new\n'] },
      { git: ['add', 'new.txt'] },
      { git: ['restore', '--staged', 'new.txt'] },
      { git: ['status', '--short'], compare: out },
    ])
  })

  it('--staged --worktree と --source', () => {
    expectSameAsRealGit([
      ...twoCommits,
      { write: ['a.txt', 'x\n'] },
      { git: ['add', 'a.txt'] },
      { git: ['restore', '--staged', '--worktree', 'a.txt'] },
      { check: true },
      { git: ['restore', '--source=HEAD~1', 'a.txt'] },
      { git: ['status', '--short'], compare: out },
      { git: ['restore', '-s', 'HEAD~1', 'c.txt'] },
      { git: ['status', '--short'], compare: out },
    ])
  })

  it('コンフリクト中：指定なしはエラー、--theirs で相手の内容にする', () => {
    expectSameAsRealGit([
      ...conflicted,
      { git: ['restore', 'story.txt'], compare: both },
      { git: ['restore', '--theirs', 'story.txt'], compare: both },
    ])
  })

  it('ファイルの指定がなければエラー', () => {
    expectSameAsRealGit([...twoCommits, { git: ['restore'], compare: both }])
  })
})

describe('git reset', () => {
  it('--soft HEAD~1：コミットを取り消して、変更はステージに残す', () => {
    expectSameAsRealGit([
      ...twoCommits,
      { git: ['reset', '--soft', 'HEAD~1'], compare: both },
      { git: ['status', '--short'], compare: out },
    ])
  })

  it('既定（--mixed）HEAD~1：変更は作業ツリーに残す', () => {
    expectSameAsRealGit([
      ...twoCommits,
      { git: ['reset', 'HEAD~1'], compare: both },
      { git: ['status', '--short'], compare: out },
    ])
  })

  it('--hard HEAD~1：作業ツリーも戻す。ORIG_HEAD で元に戻せる', () => {
    expectSameAsRealGit([
      ...twoCommits,
      { write: ['b.txt', 'dirty\n'] },
      { git: ['reset', '--hard', 'HEAD~1'], compare: both },
      { check: true },
      { git: ['reset', '--hard', 'ORIG_HEAD'], compare: both },
    ])
  })

  it('ファイルを指定すると、ステージから降ろすだけ', () => {
    expectSameAsRealGit([
      ...twoCommits,
      { write: ['a.txt', 'x\n'] },
      { write: ['b.txt', 'y\n'] },
      { git: ['add', '.'] },
      { git: ['reset', 'a.txt'], compare: both },
      { git: ['reset', 'HEAD', '--', 'b.txt'], compare: both },
      { git: ['status', '--short'], compare: out },
    ])
  })

  it('マージしたあと reset --hard ORIG_HEAD でマージ前に戻る', () => {
    expectSameAsRealGit([
      { git: ['init'] },
      { write: ['a.txt', 'a\n'] },
      { git: ['add', '.'] },
      { git: ['commit', '-m', 'a'] },
      { git: ['switch', '-c', 'feature'] },
      { write: ['b.txt', 'b\n'] },
      { git: ['add', '.'] },
      { git: ['commit', '-m', 'b'] },
      { git: ['switch', 'main'] },
      { write: ['c.txt', 'c\n'] },
      { git: ['add', '.'] },
      { git: ['commit', '-m', 'c'] },
      { git: ['merge', 'feature', '-m', 'merge feature'] },
      { git: ['reset', '--hard', 'ORIG_HEAD'], compare: both },
      { git: ['log', '--oneline'], compare: out },
    ])
  })

  it('コンフリクト中の reset --hard は、マージの途中をやめる', () => {
    expectSameAsRealGit([...conflicted, { git: ['reset', '--hard'], compare: both }])
  })

  it('コンフリクト中の --soft はできない。--hard と ファイル指定もできない', () => {
    expectSameAsRealGit([
      ...conflicted,
      { git: ['reset', '--soft', 'HEAD'], compare: both },
      { git: ['reset', '--hard', 'HEAD', '--', 'story.txt'], compare: both },
    ])
  })

  it('知らない引数はエラー', () => {
    expectSameAsRealGit([...twoCommits, { git: ['reset', 'nope'], compare: both }])
  })
})

describe('git diff', () => {
  it('作業ツリーの変更、--staged、コミットとの差分', () => {
    expectSameAsRealGit([
      ...twoCommits,
      { write: ['a.txt', 'a3\n'] },
      { write: ['b.txt', 'b1\nb2\n'] },
      { git: ['add', 'b.txt'] },
      { git: ['diff'], compare: out },
      { git: ['diff', '--staged'], compare: out },
      { git: ['diff', '--cached'], compare: out },
      { git: ['diff', 'HEAD'], compare: out },
      { git: ['diff', 'HEAD~1', 'HEAD'], compare: out },
      { git: ['diff', 'HEAD~1..HEAD', '--', 'a.txt'], compare: out },
      { git: ['diff', '--stat', 'HEAD~1'], compare: out },
      { git: ['diff', '--name-only', 'HEAD~1'], compare: out },
      { git: ['diff', '--name-status', 'HEAD~1'], compare: out },
    ])
  })

  it('新しいファイル、消したファイル、末尾に改行のないファイル', () => {
    expectSameAsRealGit([
      ...twoCommits,
      { write: ['new.txt', 'no newline'] },
      { write: ['empty.txt', ''] },
      { git: ['add', 'new.txt', 'empty.txt'] },
      { git: ['rm', '-q', 'c.txt'] },
      { git: ['diff', '--staged'], compare: out },
      { write: ['a.txt', 'a2'] },
      { git: ['diff'], compare: out },
    ])
  })

  it('離れた2か所の変更は2つのハンクになり、見出しに関数名の行が付く', () => {
    const before = [
      'function first() {',
      '  return 1',
      '}',
      '',
      'function second() {',
      '  const a = 1',
      '  const b = 2',
      '  const c = 3',
      '  const d = 4',
      '  const e = 5',
      '  const f = 6',
      '  const g = 7',
      '  return a + b',
      '}',
      '',
    ].join('\n')
    const after = before.replace('return 1', 'return 100').replace('return a + b', 'return a * b')
    expectSameAsRealGit([
      { git: ['init'] },
      { write: ['code.js', before] },
      { git: ['add', '.'] },
      { git: ['commit', '-m', 'code'] },
      { write: ['code.js', after] },
      { git: ['diff'], compare: out },
      { write: ['code.js', after.replace('const d = 4', 'const d = 40')] },
      { git: ['diff'], compare: out },
    ])
  })

  it('知らないものはエラー。-- の後なら知らないファイルでもよい', () => {
    expectSameAsRealGit([
      ...twoCommits,
      { git: ['diff', 'nope'], compare: both },
      { git: ['diff', '--', 'nope'], compare: both },
    ])
  })

  it('コンフリクト中の --staged は「Unmerged path」', () => {
    expectSameAsRealGit([...conflicted, { git: ['diff', '--staged'], compare: out }])
  })
})

describe('git show', () => {
  it('コミットの見出しと差分。--stat と、REV:path でファイルの中身', () => {
    expectSameAsRealGit([
      ...twoCommits,
      { git: ['show'], compare: out },
      { git: ['show', 'HEAD~1'], compare: out },
      { git: ['show', '--stat', 'HEAD'], compare: out },
      { git: ['show', '--name-only', 'HEAD'], compare: out },
      { git: ['show', 'HEAD~1:a.txt'], compare: out },
      { git: ['show', 'HEAD~1:c.txt'], compare: both },
      { git: ['show', 'HEAD:nope.txt'], compare: both },
    ])
  })

  it('きれいなマージコミットは、見出しだけ', () => {
    expectSameAsRealGit([
      { git: ['init'] },
      { write: ['a.txt', 'a\n'] },
      { git: ['add', '.'] },
      { git: ['commit', '-m', 'a'] },
      { git: ['switch', '-c', 'feature'] },
      { write: ['b.txt', 'b\n'] },
      { git: ['add', '.'] },
      { git: ['commit', '-m', 'b'] },
      { git: ['switch', 'main'] },
      { write: ['c.txt', 'c\n'] },
      { git: ['add', '.'] },
      { git: ['commit', '-m', 'c'] },
      { git: ['merge', 'feature', '-m', 'merge feature'] },
      { git: ['show'], compare: out },
    ])
  })
})

describe('git rm / git mv', () => {
  it('rm でファイルを消してステージ、--cached で管理から外すだけ', () => {
    expectSameAsRealGit([
      ...twoCommits,
      { git: ['rm', 'a.txt'], compare: both },
      { git: ['rm', '--cached', 'b.txt'], compare: both },
      { git: ['status', '--short'], compare: out },
    ])
  })

  it('変更のあるファイルは止める。-f で強制。フォルダには -r が要る', () => {
    expectSameAsRealGit([
      ...twoCommits,
      { write: ['a.txt', 'changed\n'] },
      { git: ['rm', 'a.txt'], compare: both },
      { git: ['rm', '-f', 'a.txt'], compare: both },
      { write: ['dir/x.txt', 'x\n'] },
      { write: ['dir/y.txt', 'y\n'] },
      { git: ['add', 'dir'] },
      { git: ['commit', '-m', 'dir'] },
      { git: ['rm', 'dir'], compare: both },
      { git: ['rm', '-r', 'dir'], compare: both },
    ])
  })

  it('mv で名前を変えて、フォルダの中へ移す', () => {
    expectSameAsRealGit([
      ...twoCommits,
      { git: ['mv', 'a.txt', 'renamed.txt'], compare: both },
      { write: ['dir/x.txt', 'x\n'] },
      { git: ['add', 'dir'] },
      { git: ['mv', 'b.txt', 'dir'], compare: both },
      { git: ['mv', 'nope.txt', 'x.txt'], compare: both },
      { git: ['mv', 'c.txt', 'renamed.txt'], compare: both },
      { git: ['status', '--short'], compare: out },
    ])
  })
})
