// シェルのコマンド（echo / touch / mkdir / rm / mv / cp / ls / cat）とリダイレクト。
// 本物のシェルと突き合わせはしないので、ここで約束ごとを決めておく。
import { describe, expect, it } from 'vitest'
import { createWorld, type ExecContext, execute, type World } from './index.ts'

const at = (workspace: string): ExecContext => ({
  workspace,
  now: { timestamp: 1_775_000_000, tzOffset: 540 },
  tty: true,
  home: '/home/me',
})

function world(): World {
  return createWorld(
    {
      '/home/me': { path: '/home/me' },
      '/home/me/app': { path: '/home/me/app', files: { 'README.md': 'hi\n', 'src/a.js': 'a\n' } },
    },
    { 'user.name': 'Me', 'user.email': 'me@example.com' },
  )
}

/** 順に実行して、最後の結果と world を返す */
function run(w: World, where: string, ...lines: string[]) {
  let cur = w
  let last = execute(cur, '', at(where))
  for (const line of lines) {
    last = execute(cur, line, at(where))
    cur = last.world
  }
  return { last, world: cur, files: cur.workspaces[where]?.files ?? {} }
}

describe('echo とリダイレクト', () => {
  it('> で書き、>> で追記する', () => {
    const { files, last } = run(
      world(),
      '/home/me/app',
      'echo hello > b.txt',
      "echo 'second line' >> b.txt",
    )
    expect(last.stdout).toBe('')
    expect(files['b.txt']).toBe('hello\nsecond line\n')
  })

  it('git の出力もファイルに書ける', () => {
    const { files } = run(world(), '/home/me/app', 'git init', 'git status --short > status.txt')
    expect(files['status.txt']).toBe('?? README.md\n?? src/\n')
  })

  it('ないフォルダの中には書けない。.git の中にも書けない', () => {
    expect(run(world(), '/home/me/app', 'echo x > nope/b.txt').last.stderr).toBe(
      'bash: nope/b.txt: No such file or directory\n',
    )
    expect(run(world(), '/home/me/app', 'git init', 'echo x > .git/HEAD').last.exitCode).toBe(1)
  })

  it('パイプとコマンドのつなぎは、まだ使えないと伝える', () => {
    for (const line of ['git log | head', 'git add . && git commit -m x', 'ls; pwd']) {
      const r = execute(world(), line, at('/home/me/app'))
      expect(r.exitCode).toBe(2)
      expect(r.stderr).toMatch(/まだ使えません/)
    }
  })
})

describe('ファイルの操作', () => {
  it('touch で空のファイルを作る。あるファイルは変えない', () => {
    const { files } = run(world(), '/home/me/app', 'touch new.txt src/b.js README.md')
    expect(files['new.txt']).toBe('')
    expect(files['src/b.js']).toBe('')
    expect(files['README.md']).toBe('hi\n')
  })

  it('rm はファイルを消す。フォルダには -r が要る。ないファイルは -f なら黙る', () => {
    let r = run(world(), '/home/me/app', 'rm README.md')
    expect(r.files['README.md']).toBeUndefined()
    r = run(r.world, '/home/me/app', 'rm src')
    expect(r.last.stderr).toBe("rm: cannot remove 'src': Is a directory\n")
    r = run(r.world, '/home/me/app', 'rm -r src')
    expect(r.files['src/a.js']).toBeUndefined()
    expect(run(r.world, '/home/me/app', 'rm nope').last.exitCode).toBe(1)
    expect(run(r.world, '/home/me/app', 'rm -f nope').last.exitCode).toBe(0)
  })

  it('rm -rf .git でリポジトリごと消える（ファイルは残る）', () => {
    const r = run(world(), '/home/me/app', 'git init', 'rm -rf .git')
    expect(r.world.workspaces['/home/me/app']?.git).toBeNull()
    expect(r.files['README.md']).toBe('hi\n')
  })

  it('mv と cp。フォルダを指定すると、その中へ', () => {
    const r = run(
      world(),
      '/home/me/app',
      'cp README.md src',
      'mv src/a.js src/b.js',
      'cp -r src lib',
    )
    expect(r.files).toEqual({
      'README.md': 'hi\n',
      'src/README.md': 'hi\n',
      'src/b.js': 'a\n',
      'lib/README.md': 'hi\n',
      'lib/b.js': 'a\n',
    })
    expect(run(r.world, '/home/me/app', 'cp src x').last.stderr).toBe(
      "cp: -r not specified; omitting directory 'src'\n",
    )
  })

  it('mkdir：リポジトリの外なら新しいフォルダ（cd して git init できる）。中なら空のフォルダは見えない', () => {
    let r = run(world(), '/home/me', 'mkdir project')
    expect(execute(r.world, 'ls', at('/home/me')).stdout).toBe('app  project\n')
    const cd = execute(r.world, 'cd project', at('/home/me'))
    expect(cd.cwd).toBe('/home/me/project')
    r = run(r.world, '/home/me/project', 'git init')
    expect(r.last.exitCode).toBe(0)

    const inside = run(world(), '/home/me/app', 'git init', 'mkdir docs')
    expect(inside.last.exitCode).toBe(0)
    expect(inside.last.stderr).toMatch(/空のフォルダ/)
  })

  it('ls はフォルダの中も見られる。cat はフォルダを断る', () => {
    expect(execute(world(), 'ls src', at('/home/me/app')).stdout).toBe('a.js\n')
    expect(execute(world(), 'cat src', at('/home/me/app')).stderr).toBe(
      'cat: src: Is a directory\n',
    )
  })

  it('リポジトリの中のフォルダには cd できないと伝える', () => {
    const r = execute(world(), 'cd src', at('/home/me/app'))
    expect(r.exitCode).toBe(1)
    expect(r.stderr).toMatch(/cd できません/)
  })
})
