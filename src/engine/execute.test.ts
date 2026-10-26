// 本物のgitと比べられない、シミュレータ独自の約束ごと（失敗時の状態、意味イベント、未対応の扱い）。
import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { createWorld, type ExecContext, execute, type World, writeFile } from './index.ts'

const ctx: ExecContext = {
  workspace: 'me',
  now: { timestamp: 1_775_000_000, tzOffset: 540 },
  tty: true,
}

function run(world: World, ...lines: string[]) {
  let w = world
  let last = execute(w, '', ctx)
  for (const line of lines) {
    last = execute(w, line, ctx)
    w = last.world
  }
  return last
}

function fresh(): World {
  const w = createWorld(
    { me: { path: '/home/me/app' } },
    { 'user.name': 'Me', 'user.email': 'me@example.com' },
  )
  return writeFile(w, 'me', 'a.txt', 'a\n')
}

describe('execute', () => {
  it('失敗したコマンドは world を変えない（同じ参照を返す）', () => {
    const before = run(fresh(), 'git init', 'git add .', 'git commit -m first').world
    const r = execute(before, 'git switch nope', ctx)
    expect(r.exitCode).toBe(128)
    expect(r.world).toBe(before)
    expect(r.events).toEqual([])
  })

  it('意味イベントを返す', () => {
    const r = run(fresh(), 'git init', 'git add .', 'git commit -m first')
    expect(r.events).toEqual([
      expect.objectContaining({
        type: 'COMMIT_CREATED',
        branch: 'main',
        amend: false,
        parents: [],
      }),
    ])
  })

  it('detached HEAD に入り、コミットを置き去りにするとイベントが出る', () => {
    const base = run(fresh(), 'git init', 'git add .', 'git commit -m first').world
    const detached = execute(base, 'git switch --detach HEAD', ctx)
    expect(detached.events.map((e) => e.type)).toContain('DETACHED_HEAD_ENTERED')
    const withCommit = run(
      writeFile(detached.world, 'me', 'a.txt', 'changed\n'),
      'git commit -am experiment',
    ).world
    const back = execute(withCommit, 'git switch main', ctx)
    expect(back.events.map((e) => e.type)).toContain('COMMITS_ORPHANED')
    expect(back.stderr).toContain('Warning: you are leaving 1 commit behind')
  })

  it('端末では log に装飾が付く', () => {
    const r = run(fresh(), 'git init', 'git add .', 'git commit -m first', 'git log --oneline')
    expect(r.stdout).toMatch(/^[0-9a-f]{7} \(HEAD -> main\) first\n$/)
  })

  it('未対応の操作は unsupported として区別する', () => {
    const base = run(fresh(), 'git init')
    expect(execute(base.world, 'git rebase main', ctx)).toMatchObject({
      exitCode: 1,
      unsupported: true,
    })
    expect(execute(base.world, 'rm -rf build', ctx).unsupported).toBe(true)
    expect(execute(base.world, 'git commit', ctx).unsupported).toBe(true)
  })

  it('存在しないサブコマンドは本物のgitと同じエラー', () => {
    const r = execute(fresh(), 'git comit -m x', ctx)
    expect(r.stderr).toBe("git: 'comit' is not a git command. See 'git --help'.\n")
    expect(r.unsupported).toBeUndefined()
  })

  it('リポジトリの外では fatal', () => {
    const r = execute(fresh(), 'git status', ctx)
    expect(r.exitCode).toBe(128)
    expect(r.stderr).toContain('not a git repository')
  })

  it('想定外の例外は throw せず、world を変えずに内部エラーとして返す', () => {
    const base = run(fresh(), 'git init', 'git add .', 'git commit -m first').world
    // 存在しないコミットを指すブランチ（壊れた保存データなど）
    const broken = produce(base, (draft) => {
      const git = draft.workspaces.me?.git
      if (git) git.refs['refs/heads/main'] = 'f'.repeat(40)
    })
    const r = execute(broken, 'git log', ctx)
    expect(r.exitCode).toBe(1)
    expect(r.stderr).toMatch(/^git-sensei: 内部エラーが起きました（.+）\n$/)
    expect(r.world).toBe(broken)
    expect(r.events).toEqual([])
  })
})

describe('利用者の入力で throw しない', () => {
  // 決まった種から作る疑似乱数（テストを毎回同じにする）
  function rng(seed: number) {
    let s = seed
    return () => {
      s = (s * 1_103_515_245 + 12_345) % 2 ** 31
      return s / 2 ** 31
    }
  }
  const SYMBOLS = [
    '[',
    ']',
    '*',
    '?',
    '!',
    '^',
    '-',
    ':',
    '\\',
    '/',
    '.',
    '~',
    '@',
    '{',
    '}',
    'a',
    'あ',
  ]
  const SUBS = ['add', 'switch', 'log', 'branch', 'checkout', 'merge', 'commit -m', 'status']

  it('記号だらけの引数でも内部エラーにならない', () => {
    const base = run(
      fresh(),
      'git init',
      'git add .',
      'git commit -m first',
      'git branch feature',
    ).world
    const next = rng(42)
    const pick = <T>(xs: T[]) => xs[Math.floor(next() * xs.length)] as T
    for (let n = 0; n < 500; n++) {
      const len = 1 + Math.floor(next() * 6)
      const arg = Array.from({ length: len }, () => pick(SYMBOLS)).join('')
      const line = `git ${pick(SUBS)} '${arg}'`
      const r = execute(base, line, ctx)
      expect(r.stderr, line).not.toContain('内部エラー')
    }
  })
})
