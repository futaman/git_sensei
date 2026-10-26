// マージコミット：fast-forward できない merge / pull、コンフリクトの発生と解消、--abort / --continue
import { describe, it } from 'vitest'
import { expectSameAsRealGit, type Step } from './harness.ts'

const out = ['stdout'] as ('stdout' | 'stderr')[]

const BASE_TEXT = 'line 1\nline 2\nline 3\nline 4\nline 5\n'

/** main と feature が、同じ祖先から別々に進んだところ（まだ main にいる） */
function diverged(onMain: Step[], onFeature: Step[]): Step[] {
  return [
    { git: ['init'] },
    { write: ['story.txt', BASE_TEXT] },
    { write: ['other.txt', 'other\n'] },
    { git: ['add', '.'] },
    { git: ['commit', '-m', 'base'] },
    { git: ['switch', '-c', 'feature'] },
    ...onFeature,
    { git: ['commit', '-am', 'feature work'] },
    { git: ['switch', 'main'] },
    ...onMain,
    { git: ['commit', '-am', 'main work'] },
  ]
}

const cleanDivergence = diverged(
  [{ write: ['story.txt', 'line 1 (main)\nline 2\nline 3\nline 4\nline 5\n'] }],
  [{ write: ['story.txt', 'line 1\nline 2\nline 3\nline 4\nline 5 (feature)\n'] }],
)

const conflictDivergence = diverged(
  [{ write: ['story.txt', 'line 1\nline 2\nline 3 by main\nline 4\nline 5\n'] }],
  [{ write: ['story.txt', 'line 1\nline 2\nline 3 by feature\nline 4\nline 5\n'] }],
)

describe('3-way マージ（コンフリクトなし）', () => {
  it('同じファイルの離れた場所の変更を両方取り込み、マージコミットを作る', () => {
    expectSameAsRealGit([
      ...cleanDivergence,
      { git: ['merge', 'feature'], compare: out },
      { git: ['log', '--oneline'], compare: out },
      { git: ['log', '-1'], compare: out },
      { git: ['status'], compare: out },
    ])
  })

  it('別々のファイルの追加・削除もまとめて取り込む', () => {
    expectSameAsRealGit([
      ...diverged(
        [{ write: ['main-only.txt', 'm\n'] }, { git: ['add', '.'] }],
        [{ remove: 'other.txt' }, { write: ['feature-only.txt', 'f\n'] }, { git: ['add', '-A'] }],
      ),
      { git: ['merge', 'feature'], compare: out },
    ])
  })

  it('--no-ff と、main 以外へのマージのメッセージ', () => {
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
      { git: ['switch', '-c', 'develop'] },
      { git: ['merge', '--no-ff', 'feature'], compare: out },
      { git: ['log', '-1'], compare: out },
      { git: ['switch', 'main'] },
      { git: ['merge', '--no-ff', '-m', '機能をマージ', 'feature'], compare: out },
      { git: ['log', '--oneline'], compare: out },
    ])
  })
})

describe('コンフリクト', () => {
  it('同じ行を変えるとコンフリクトし、直して add して commit する', () => {
    expectSameAsRealGit([
      ...conflictDivergence,
      { git: ['merge', 'feature'], compare: out },
      { check: true },
      { git: ['status'], compare: out },
      { git: ['status', '-s'], compare: out },
      { write: ['story.txt', 'line 1\nline 2\nline 3 by both\nline 4\nline 5\n'] },
      { git: ['status'], compare: out },
      { git: ['add', 'story.txt'] },
      { git: ['status'], compare: out },
      { git: ['commit', '--no-edit'], compare: out },
      { git: ['log', '-1'], compare: out },
      { git: ['status'], compare: out },
    ])
  })

  it('エディタを開く commit（そのまま保存）でもコミットできる', () => {
    expectSameAsRealGit([
      ...conflictDivergence,
      { git: ['merge', 'feature'] },
      { write: ['story.txt', 'resolved\n'] },
      { git: ['add', '.'] },
      { git: ['commit'] },
      { git: ['log', '-1'], compare: out },
    ])
  })

  it('merge --continue', () => {
    expectSameAsRealGit([
      ...conflictDivergence,
      { git: ['merge', 'feature'] },
      { git: ['merge', '--continue'] },
      { write: ['story.txt', 'resolved\n'] },
      { git: ['add', '.'] },
      { git: ['merge', '--continue'], compare: out },
    ])
  })

  it('両方が同じ名前のファイルを追加した（add/add）', () => {
    expectSameAsRealGit([
      ...diverged(
        [{ write: ['new.txt', 'from main\n'] }, { git: ['add', '.'] }],
        [{ write: ['new.txt', 'from feature\n'] }, { git: ['add', '.'] }],
      ),
      { git: ['merge', 'feature'], compare: out },
      { git: ['status'], compare: out },
      { git: ['status', '--porcelain'], compare: out },
    ])
  })

  it('片方が削除し、もう片方が変更した（modify/delete）', () => {
    expectSameAsRealGit([
      ...diverged(
        [{ remove: 'other.txt' }, { git: ['add', '-A'] }],
        [{ write: ['other.txt', 'changed by feature\n'] }],
      ),
      { git: ['merge', 'feature'], compare: out },
      { git: ['status'], compare: out },
      { git: ['status', '-s'], compare: out },
      { git: ['add', 'other.txt'] },
      { git: ['commit', '--no-edit'] },
    ])
  })

  it('変更した側が main で、削除した側が feature', () => {
    expectSameAsRealGit([
      ...diverged(
        [{ write: ['other.txt', 'changed by main\n'] }],
        [{ remove: 'other.txt' }, { git: ['add', '-A'] }],
      ),
      { git: ['merge', 'feature'], compare: out },
      { git: ['status', '-s'], compare: out },
      { remove: 'other.txt' },
      { git: ['add', 'other.txt'] },
      { git: ['status'], compare: out },
      { git: ['commit', '--no-edit'] },
    ])
  })

  it('コンフリクトの途中にできないこと', () => {
    expectSameAsRealGit([
      ...conflictDivergence,
      { git: ['merge', 'feature'] },
      { git: ['commit', '-m', 'try'] },
      { git: ['merge', 'feature'] },
      { git: ['switch', 'feature'] },
      { git: ['checkout', 'feature'] },
      { git: ['commit', '--amend', '--no-edit'] },
      { write: ['story.txt', 'resolved\n'] },
      { git: ['add', '.'] },
      { git: ['merge', 'feature'] },
      { git: ['switch', 'feature'] },
      { check: true },
    ])
  })
})

describe('merge --abort', () => {
  it('コンフリクトの前に戻し、関係ない手元の変更は残す', () => {
    expectSameAsRealGit([
      ...conflictDivergence,
      { write: ['notes.txt', 'untracked memo\n'] },
      { git: ['merge', 'feature'] },
      { git: ['merge', '--abort'] },
      { git: ['status'], compare: out },
      { git: ['merge', '--abort'] },
    ])
  })
})

describe('マージを始められないとき', () => {
  it('ステージ済みの変更がある', () => {
    expectSameAsRealGit([
      ...cleanDivergence,
      { write: ['other.txt', 'staged change\n'] },
      { git: ['add', 'other.txt'] },
      { git: ['merge', 'feature'] },
    ])
  })

  it('マージで書き換わるファイルに未ステージの変更がある', () => {
    expectSameAsRealGit([
      ...cleanDivergence,
      { write: ['story.txt', 'local edit\n'] },
      { git: ['merge', 'feature'] },
    ])
  })

  it('関係ないファイルの未ステージの変更は、そのまま持ち越せる', () => {
    expectSameAsRealGit([
      ...cleanDivergence,
      { write: ['other.txt', 'local edit\n'] },
      { git: ['merge', 'feature'], compare: out },
      { git: ['status', '-s'], compare: out },
    ])
  })

  it('未追跡のファイルが上書きされる', () => {
    expectSameAsRealGit([
      ...diverged(
        [{ write: ['story.txt', `${BASE_TEXT}main\n`] }],
        [{ write: ['new.txt', 'from feature\n'] }, { git: ['add', '.'] }],
      ),
      { write: ['new.txt', 'my untracked\n'] },
      { git: ['merge', 'feature'] },
    ])
  })
})

describe('リモートとのマージ', () => {
  const ORIGIN = '{root}/origin.git'
  const team: Step[] = [
    { in: 'origin.git', git: ['init', '--bare'] },
    { in: 'npc', git: ['init'] },
    { in: 'npc', write: ['story.txt', BASE_TEXT] },
    { in: 'npc', git: ['add', '.'] },
    { in: 'npc', git: ['commit', '-m', 'initial'] },
    { in: 'npc', git: ['remote', 'add', 'origin', ORIGIN] },
    { in: 'npc', git: ['push', '-u', 'origin', 'main'] },
    { in: '.', git: ['clone', ORIGIN, 'me'] },
  ]

  it('pull --no-rebase でマージコミットを作る', () => {
    expectSameAsRealGit([
      ...team,
      { in: 'npc', write: ['story.txt', 'line 1\nline 2\nline 3\nline 4\nline 5 (npc)\n'] },
      { in: 'npc', git: ['commit', '-am', 'npc work'] },
      { in: 'npc', git: ['push'] },
      { write: ['story.txt', 'line 1 (me)\nline 2\nline 3\nline 4\nline 5\n'] },
      { git: ['commit', '-am', 'my work'] },
      { git: ['pull', '--no-rebase'], compare: out },
      { git: ['log', '-1'], compare: out },
      { git: ['status'], compare: out },
      { git: ['push'] },
    ])
  })

  it('pull.rebase=false の設定で pull し、コンフリクトを解消して push する', () => {
    expectSameAsRealGit([
      ...team,
      { in: 'npc', write: ['story.txt', 'line 1\nline 2\nline 3 by npc\nline 4\nline 5\n'] },
      { in: 'npc', git: ['commit', '-am', 'npc work'] },
      { in: 'npc', git: ['push'] },
      { write: ['story.txt', 'line 1\nline 2\nline 3 by me\nline 4\nline 5\n'] },
      { git: ['commit', '-am', 'my work'] },
      { git: ['config', 'pull.rebase', 'false'] },
      { git: ['pull'], compare: out },
      { check: true },
      { git: ['status'], compare: out },
      { write: ['story.txt', 'line 1\nline 2\nline 3 by both\nline 4\nline 5\n'] },
      { git: ['add', '.'] },
      { git: ['commit', '--no-edit'] },
      { git: ['log', '-1'], compare: out },
      { git: ['push'] },
      { in: 'npc', git: ['pull'] },
    ])
  })

  it('リモート追跡ブランチをマージする', () => {
    expectSameAsRealGit([
      ...team,
      { in: 'npc', write: ['story.txt', 'line 1\nline 2\nline 3\nline 4\nline 5 (npc)\n'] },
      { in: 'npc', git: ['commit', '-am', 'npc work'] },
      { in: 'npc', git: ['push'] },
      { write: ['story.txt', 'line 1 (me)\nline 2\nline 3\nline 4\nline 5\n'] },
      { git: ['commit', '-am', 'my work'] },
      { git: ['fetch'] },
      { git: ['merge', 'origin/main'], compare: out },
      { git: ['log', '-1'], compare: out },
      { git: ['status', '-sb'], compare: out },
    ])
  })
})
