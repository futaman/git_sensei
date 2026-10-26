// M1：init / add / commit / status / log / branch / switch / checkout / merge（fast-forward）
import { describe, it } from 'vitest'
import { expectSameAsRealGit, type Step } from './harness.ts'

const out = ['stdout'] as ('stdout' | 'stderr')[]

/** README.md を1回コミットしたところまで */
const firstCommit: Step[] = [
  { git: ['init'] },
  { write: ['README.md', 'hello\n'] },
  { git: ['add', 'README.md'] },
  { git: ['commit', '-m', 'first commit'], compare: out },
]

describe('init と最初のコミット', () => {
  it('まだコミットがない状態の status', () => {
    expectSameAsRealGit([
      { git: ['init'] },
      { git: ['status'], compare: out },
      { write: ['README.md', 'hello\n'] },
      { write: ['notes/todo.txt', 'a\nb\n'] },
      { git: ['status'], compare: out },
      { git: ['status', '--short'], compare: out },
      { git: ['add', 'README.md'] },
      { git: ['status'], compare: out },
      { git: ['log'] },
      { git: ['branch'], compare: out },
    ])
  })

  it('最初のコミット、log、status', () => {
    expectSameAsRealGit([
      ...firstCommit,
      { git: ['status'], compare: out },
      { git: ['log'], compare: out },
      { git: ['log', '--oneline'], compare: out },
    ])
  })

  it('日本語のコミットメッセージと複数の -m', () => {
    expectSameAsRealGit([
      { git: ['init'] },
      { write: ['a.txt', 'あいう\n'] },
      { git: ['add', '.'] },
      { git: ['commit', '-m', '最初のコミット', '-m', '本文の1行目\n本文の2行目'], compare: out },
      { git: ['log'], compare: out },
    ])
  })

  it('init をもう一度実行しても壊れない', () => {
    expectSameAsRealGit([...firstCommit, { git: ['init'] }, { git: ['status'], compare: out }])
  })
})

describe('add', () => {
  it('ディレクトリ、.、ワイルドカード、削除の反映', () => {
    expectSameAsRealGit([
      { git: ['init'] },
      { write: ['src/a.ts', 'a\n'] },
      { write: ['src/b.ts', 'b\n'] },
      { write: ['docs/x.md', 'x\n'] },
      { write: ['top.txt', 't\n'] },
      { git: ['add', 'src'] },
      { check: true },
      { git: ['add', '*.txt'] },
      { check: true },
      { git: ['add', '.'] },
      { git: ['commit', '-m', 'add files'], compare: out },
      { remove: 'src/b.ts' },
      { write: ['src/a.ts', 'a\nmore\n'] },
      { write: ['new.txt', 'n\n'] },
      { git: ['add', '-u'] },
      { git: ['status'], compare: out },
      { git: ['add', '-A'] },
      { git: ['status', '--porcelain'], compare: out },
    ])
  })

  it('一致しない pathspec はエラーになり、何もステージしない', () => {
    expectSameAsRealGit([
      { git: ['init'] },
      { write: ['a.txt', 'a\n'] },
      { git: ['add', 'a.txt', 'missing.txt'] },
      { check: true },
      { git: ['add'] },
    ])
  })

  it('削除したファイルを名前で add すると削除がステージされる', () => {
    expectSameAsRealGit([
      ...firstCommit,
      { remove: 'README.md' },
      { git: ['status'], compare: out },
      { git: ['add', 'README.md'] },
      { git: ['status'], compare: out },
      { git: ['commit', '-m', 'remove readme'], compare: out },
    ])
  })
})

describe('status', () => {
  it('ステージ済み・未ステージ・未追跡が混ざった状態', () => {
    expectSameAsRealGit([
      ...firstCommit,
      { write: ['a.txt', '1\n'] },
      { write: ['b.txt', '1\n'] },
      { git: ['add', '.'] },
      { git: ['commit', '-m', 'two files'] },
      { write: ['a.txt', '1\n2\n'] },
      { git: ['add', 'a.txt'] },
      { write: ['a.txt', '1\n2\n3\n'] },
      { remove: 'b.txt' },
      { write: ['c.txt', 'c\n'] },
      { git: ['add', 'c.txt'] },
      { write: ['untracked/deep/file.txt', 'u\n'] },
      { git: ['status'], compare: out },
      { git: ['status', '-s'], compare: out },
      { git: ['status', '--porcelain', '-b'], compare: out },
    ])
  })

  it('未追跡のファイルがあるディレクトリでも、追跡中のファイルがあればまとめない', () => {
    expectSameAsRealGit([
      { git: ['init'] },
      { write: ['dir/tracked.txt', 't\n'] },
      { git: ['add', '.'] },
      { git: ['commit', '-m', 'init'] },
      { write: ['dir/new.txt', 'n\n'] },
      { write: ['dir/sub/x.txt', 'x\n'] },
      { git: ['status', '--porcelain'], compare: out },
    ])
  })
})

describe('commit', () => {
  it('何も変更がないとき、-a、--allow-empty', () => {
    expectSameAsRealGit([
      ...firstCommit,
      { git: ['commit', '-m', 'nothing'], compare: out },
      { write: ['new.txt', 'n\n'] },
      { git: ['commit', '-m', 'only untracked'], compare: out },
      { write: ['README.md', 'hello\nworld\n'] },
      { git: ['commit', '-m', 'not staged'], compare: out },
      { git: ['commit', '-am', 'with -a'], compare: out },
      { git: ['commit', '--allow-empty', '-m', 'empty'], compare: out },
      { git: ['log', '--oneline'], compare: out },
    ])
  })

  it('--amend', () => {
    expectSameAsRealGit([
      ...firstCommit,
      { write: ['README.md', 'hello\nagain\n'] },
      { git: ['add', '.'] },
      { git: ['commit', '-m', 'second'] },
      { write: ['extra.txt', 'e\n'] },
      { git: ['add', 'extra.txt'] },
      { git: ['commit', '--amend', '--no-edit'], compare: out },
      { git: ['commit', '--amend', '-m', 'second (fixed)'], compare: out },
      { git: ['log'], compare: out },
    ])
  })

  it('空のメッセージは中止される', () => {
    expectSameAsRealGit([
      { git: ['init'] },
      { write: ['a.txt', 'a\n'] },
      { git: ['add', '.'] },
      { git: ['commit', '-m', '  '] },
    ])
  })
})

describe('log', () => {
  it('件数とリビジョンの指定', () => {
    expectSameAsRealGit([
      ...firstCommit,
      { write: ['README.md', '2\n'] },
      { git: ['commit', '-am', 'two'] },
      { write: ['README.md', '3\n'] },
      { git: ['commit', '-am', 'three'] },
      { git: ['log', '--oneline', '-2'], compare: out },
      { git: ['log', '--oneline', '-n', '1'], compare: out },
      { git: ['log', '--oneline', 'HEAD~1'], compare: out },
      { git: ['log', '--oneline', 'HEAD^^'], compare: out },
      { git: ['log', 'nope'] },
    ])
  })

  it('--decorate（端末で見るときの表示）', () => {
    expectSameAsRealGit([
      ...firstCommit,
      { git: ['branch', 'feature'] },
      { git: ['branch', 'another'] },
      { write: ['README.md', '2\n'] },
      { git: ['commit', '-am', 'two'] },
      { git: ['log', '--decorate'], compare: out },
      { git: ['log', '--oneline', '--decorate'], compare: out },
      { git: ['switch', '--detach', 'HEAD~1'] },
      { git: ['log', '--oneline', '--decorate', 'main'], compare: out },
    ])
  })
})

describe('branch', () => {
  it('作成・一覧・削除・名前の変更', () => {
    expectSameAsRealGit([
      ...firstCommit,
      { write: ['README.md', '2\n'] },
      { git: ['commit', '-am', 'two'] },
      { git: ['branch', 'feature'] },
      { git: ['branch', 'old', 'HEAD~1'] },
      { git: ['branch'], compare: out },
      { git: ['branch', 'feature'] },
      { git: ['branch', 'bad name'] },
      { git: ['branch', '-d', 'feature'], compare: out },
      { git: ['branch', '-d', 'main'] },
      { git: ['branch', '-d', 'nope'] },
      { git: ['branch', '-m', 'trunk'] },
      { git: ['branch', '--show-current'], compare: out },
      { git: ['branch', '-m', 'old', 'older'] },
      { git: ['branch'], compare: out },
    ])
  })

  it('マージされていないブランチは -d で消せず、-D なら消せる', () => {
    expectSameAsRealGit([
      ...firstCommit,
      { git: ['switch', '-c', 'topic'] },
      { write: ['t.txt', 't\n'] },
      { git: ['add', '.'] },
      { git: ['commit', '-m', 'topic work'] },
      { git: ['switch', 'main'] },
      { git: ['branch', '-d', 'topic'] },
      { check: true },
      { git: ['branch', '-D', 'topic'], compare: out },
    ])
  })
})

describe('switch / checkout', () => {
  it('ブランチの行き来と、作業ツリーの入れ替わり', () => {
    expectSameAsRealGit([
      ...firstCommit,
      { git: ['switch', '-c', 'feature'] },
      { write: ['feature.txt', 'f\n'] },
      { write: ['README.md', 'hello\nfeature\n'] },
      { git: ['add', '.'] },
      { git: ['commit', '-m', 'feature work'] },
      { git: ['switch', 'main'] },
      { check: true },
      { git: ['switch', '-'] },
      { check: true },
      { git: ['switch', 'feature'] },
      { git: ['switch', 'nope'] },
      { git: ['switch', 'HEAD~1'] },
      { git: ['checkout', 'main'] },
      { git: ['checkout', '-b', 'other'] },
      { git: ['status'], compare: out },
    ])
  })

  it('手元の変更は衝突しなければ持ち越す', () => {
    expectSameAsRealGit([
      ...firstCommit,
      { write: ['other.txt', 'o\n'] },
      { git: ['add', '.'] },
      { git: ['commit', '-m', 'other'] },
      { git: ['branch', 'feature'] },
      { write: ['other.txt', 'o\nlocal\n'] },
      { write: ['staged.txt', 's\n'] },
      { git: ['add', 'staged.txt'] },
      { git: ['switch', 'feature'], compare: out },
      { git: ['status'], compare: out },
    ])
  })

  it('手元の変更が上書きされるなら切り替えない', () => {
    expectSameAsRealGit([
      ...firstCommit,
      { git: ['switch', '-c', 'feature'] },
      { write: ['README.md', 'feature\n'] },
      { write: ['only-feature.txt', 'f\n'] },
      { git: ['add', '.'] },
      { git: ['commit', '-m', 'feature'] },
      { git: ['switch', 'main'] },
      { write: ['README.md', 'local edit\n'] },
      { git: ['switch', 'feature'] },
    ])
  })

  it('未追跡のファイルが上書きされるなら切り替えない', () => {
    expectSameAsRealGit([
      ...firstCommit,
      { git: ['switch', '-c', 'feature'] },
      { write: ['new.txt', 'from feature\n'] },
      { git: ['add', '.'] },
      { git: ['commit', '-m', 'add new'] },
      { git: ['switch', 'main'] },
      { write: ['new.txt', 'my untracked\n'] },
      { git: ['switch', 'feature'] },
    ])
  })

  it('detached HEAD とコミットの置き去り', () => {
    expectSameAsRealGit([
      ...firstCommit,
      { write: ['README.md', '2\n'] },
      { git: ['commit', '-am', 'two'] },
      { git: ['switch', '--detach', 'HEAD~1'] },
      { git: ['status'], compare: out },
      { git: ['branch'], compare: out },
      { write: ['README.md', 'experiment\n'] },
      { git: ['commit', '-am', 'experiment'], compare: out },
      { git: ['status'], compare: out },
      { git: ['switch', 'main'] },
      { check: true },
      { git: ['checkout', 'HEAD~1'] },
      { git: ['checkout', 'main'] },
    ])
  })

  it('まだコミットがないリポジトリで switch -c', () => {
    expectSameAsRealGit([
      { git: ['init'] },
      { git: ['switch', '-c', 'develop'] },
      { write: ['a.txt', 'a\n'] },
      { git: ['add', '.'] },
      { git: ['commit', '-m', 'on develop'], compare: out },
      { git: ['branch'], compare: out },
    ])
  })
})

describe('merge（fast-forward）', () => {
  const featureAhead: Step[] = [
    ...firstCommit,
    { git: ['switch', '-c', 'feature'] },
    { write: ['README.md', 'hello\nfrom feature\n'] },
    { write: ['src/app.ts', 'console.log(1)\nconsole.log(2)\n'] },
    { git: ['add', '.'] },
    { git: ['commit', '-m', 'feature 1'] },
    { write: ['src/app.ts', 'console.log(1)\n'] },
    { git: ['commit', '-am', 'feature 2'] },
    { git: ['switch', 'main'] },
  ]

  it('fast-forward と Already up to date', () => {
    expectSameAsRealGit([
      ...featureAhead,
      { git: ['merge', 'feature'], compare: out },
      { git: ['merge', 'feature'], compare: out },
      { git: ['log', '--oneline'], compare: out },
      { git: ['merge', 'nope'] },
    ])
  })

  it('手元の変更が上書きされるなら fast-forward しない', () => {
    expectSameAsRealGit([
      ...featureAhead,
      { write: ['README.md', 'local\n'] },
      { git: ['merge', 'feature'] },
    ])
  })

  it('分岐していると --ff-only は失敗する', () => {
    expectSameAsRealGit([
      ...featureAhead,
      { write: ['main.txt', 'm\n'] },
      { git: ['add', '.'] },
      { git: ['commit', '-m', 'main work'] },
      { git: ['merge', '--ff-only', 'feature'] },
    ])
  })
})

describe('Object.prototype と同じ名前のファイル・ブランチ', () => {
  it.each(['toString', 'constructor', '__proto__', 'valueOf', 'hasOwnProperty'])('%s', (name) => {
    expectSameAsRealGit([
      { git: ['init'] },
      { write: [name, 'v1\n'] },
      { git: ['status'], compare: out },
      { write: [name, 'v2\n'] },
      // 最後の1ファイルを消す commit -a は本物の git でも空振りするので、もう1つ置いておく
      { write: ['keep.txt', 'k\n'] },
      { git: ['add', name, 'keep.txt'] },
      { git: ['commit', '-m', `add ${name}`], compare: out },
      { git: ['switch', '-c', name] },
      { remove: name },
      { git: ['status'], compare: out },
      { git: ['status', '--short'], compare: out },
      { git: ['commit', '-am', `remove ${name}`], compare: out },
      { git: ['switch', 'main'] },
      { check: true },
      { git: ['switch', name] },
      { check: true },
      { git: [name] },
      { git: ['log', '--oneline', name], compare: out },
    ])
  })
})

describe('pathspec の [ ]', () => {
  it('文字クラス、否定、範囲、閉じていない [', () => {
    expectSameAsRealGit([
      { git: ['init'] },
      { git: ['add', '['], compare: ['stderr'] },
      { git: ['add', 'a[b'], compare: ['stderr'] },
      { write: ['a.txt', 'a\n'] },
      { write: ['b.txt', 'b\n'] },
      { write: ['c.md', 'c\n'] },
      { write: ['x1', '1\n'] },
      { write: ['x9', '9\n'] },
      { write: ['a[bc', 'literal\n'] },
      { write: ['b[x]', 'literal\n'] },
      { git: ['add', '[ab].txt'] },
      { check: true },
      { git: ['add', 'x[[:digit:]]'] },
      { check: true },
      { git: ['add', '[!abx]*'] },
      { check: true },
      { git: ['add', 'a[b*'], compare: ['stderr'] },
      { git: ['add', 'a[bc'] },
      { git: ['add', 'b[x]'] },
      { git: ['add', '[z-a]'], compare: ['stderr'] },
      { git: ['status', '--short'], compare: ['stdout'] },
    ])
  })
})
