// 本物のgitを、作者・日時・設定を固定した状態で実行する（docs/05 §2.2）。
// シミュレータとの突き合わせテストは、この結果を正として比べる。
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import type { Snapshot, Step } from './harness.ts'

export const FIXED_DATE = '2026-04-01T09:00:00+09:00'

const FIXED_IDENTITY = {
  GIT_AUTHOR_NAME: 'Sensei',
  GIT_AUTHOR_EMAIL: 'sensei@example.com',
  GIT_AUTHOR_DATE: FIXED_DATE,
  GIT_COMMITTER_NAME: 'Sensei',
  GIT_COMMITTER_EMAIL: 'sensei@example.com',
  GIT_COMMITTER_DATE: FIXED_DATE,
}

// 利用者の ~/.gitconfig や OS の設定に結果が左右されないようにする
const FIXED_CONFIG = ['-c', 'core.autocrlf=false', '-c', 'init.defaultBranch=main']

export interface ExecOutput {
  stdout: string
  stderr: string
  exitCode: number
}

export class RealGitRepo {
  readonly dir: string
  private readonly env: NodeJS.ProcessEnv

  constructor() {
    const home = mkdtempSync(join(tmpdir(), 'git-sensei-golden-'))
    this.dir = join(home, 'repo')
    mkdirSync(this.dir)
    const emptyConfig = join(home, 'gitconfig')
    writeFileSync(emptyConfig, '')
    this.env = {
      PATH: process.env.PATH,
      SYSTEMROOT: process.env.SYSTEMROOT,
      HOME: home,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: emptyConfig,
      LANG: 'C',
      ...FIXED_IDENTITY,
    }
  }

  exec(args: string[]): ExecOutput {
    const r = spawnSync('git', [...FIXED_CONFIG, ...args], {
      cwd: this.dir,
      env: this.env,
      encoding: 'utf8',
    })
    if (r.error) throw r.error
    return { stdout: r.stdout, stderr: r.stderr, exitCode: r.status ?? -1 }
  }

  /** 成功する前提のコマンド。出力の末尾の改行は除く */
  git(...args: string[]): string {
    const r = this.exec(args)
    if (r.exitCode !== 0) throw new Error(`git ${args.join(' ')} failed:\n${r.stderr}`)
    return r.stdout.trimEnd()
  }

  write(path: string, content: string): void {
    const full = join(this.dir, path)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, content)
  }

  remove(path: string): void {
    rmSync(join(this.dir, path))
  }

  run(steps: Step[]): this {
    for (const step of steps) {
      if ('git' in step) this.exec(step.git)
      else if ('write' in step) this.write(step.write[0], step.write[1])
      else if ('remove' in step) this.remove(step.remove)
    }
    return this
  }

  snapshot(): Snapshot {
    const symbolic = this.exec(['symbolic-ref', '-q', 'HEAD'])
    const head =
      symbolic.exitCode === 0
        ? `ref: ${symbolic.stdout.trim()}`
        : `detached: ${this.git('rev-parse', 'HEAD')}`
    const lines = (s: string) => (s === '' ? [] : s.split('\n'))
    const refs = lines(this.git('for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads'))
    const hasCommits =
      this.exec(['rev-parse', '--verify', '-q', 'HEAD']).exitCode === 0 || refs.length > 0
    const commits = hasCommits ? lines(this.git('rev-list', '--all', '--parents')).sort() : []
    const index = lines(this.git('ls-files', '-s'))
    const status = this.exec(['status', '--porcelain']).stdout
    return { head, refs, commits, index, worktree: this.files(), status }
  }

  private files(): Record<string, string> {
    const out: Record<string, string> = {}
    for (const e of readdirSync(this.dir, { recursive: true, withFileTypes: true })) {
      if (!e.isFile()) continue
      const path = relative(this.dir, join(e.parentPath, e.name)).replaceAll('\\', '/')
      if (path === '.git' || path.startsWith('.git/')) continue
      out[path] = readFileSync(join(this.dir, path), 'utf8')
    }
    return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)))
  }

  dispose(): void {
    rmSync(dirname(this.dir), { recursive: true, force: true })
  }
}
