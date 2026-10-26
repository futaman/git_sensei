// 本物のgitを、作者・日時・設定を固定した状態で実行する（docs/05 §2.2）。
// シミュレータとの突き合わせテストは、この結果を正として比べる。
// 一時ディレクトリの下の work/ が作業場所で、その下にリポジトリ（me, npc, origin.git など）を作る。
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import type { Snapshot, Step } from './harness.ts'

export const FIXED_DATE = '2026-04-01T09:00:00+09:00'
export const IDENTITY = { name: 'Sensei', email: 'sensei@example.com' }

// 利用者の ~/.gitconfig や OS の設定に結果が左右されないようにする
// followRemoteHEAD: git 2.48 から、fetch が origin/HEAD を自動で作るようになった（既定 create）。
// 本物に設定を渡すと remote.origin.* があるだけで origin が「ある」ことになってしまうので、
// 本物はそのままにし、シミュレータ側をインストールされている git のバージョンに合わせる
export const FOLLOW_REMOTE_HEAD = 'remote.origin.followremotehead'
const FIXED_CONFIG = ['-c', 'core.autocrlf=false', '-c', 'init.defaultBranch=main']

/** インストールされている git が、fetch で origin/HEAD を作るか */
export function gitCreatesRemoteHead(): boolean {
  const out = spawnSync('git', ['--version'], { encoding: 'utf8' }).stdout
  const m = /(\d+)\.(\d+)/.exec(out)
  if (!m) return true
  const [major, minor] = [Number(m[1]), Number(m[2])]
  return major > 2 || (major === 2 && minor >= 48)
}

export interface ExecOutput {
  stdout: string
  stderr: string
  exitCode: number
}

export class RealGitRepo {
  private readonly home: string
  /** 作業場所のルート（区切りは '/'） */
  readonly root: string
  private readonly env: NodeJS.ProcessEnv

  constructor() {
    this.home = mkdtempSync(join(tmpdir(), 'git-sensei-golden-'))
    this.root = join(this.home, 'work').replaceAll('\\', '/')
    mkdirSync(this.root)
    const globalConfig = join(this.home, 'gitconfig')
    writeFileSync(globalConfig, `[user]\n\tname = ${IDENTITY.name}\n\temail = ${IDENTITY.email}\n`)
    this.env = {
      PATH: process.env.PATH,
      SYSTEMROOT: process.env.SYSTEMROOT,
      HOME: this.home,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: globalConfig,
      LANG: 'C',
      GIT_AUTHOR_DATE: FIXED_DATE,
      GIT_COMMITTER_DATE: FIXED_DATE,
      // エディタが開く場面では、そのまま保存したことにする
      GIT_EDITOR: 'true',
    }
  }

  /** ワークスペース名（'.' はルート）から実際のディレクトリ */
  dir(name: string): string {
    return name === '.' ? this.root : `${this.root}/${name}`
  }

  ensureDir(name: string): void {
    mkdirSync(this.dir(name), { recursive: true })
  }

  exec(args: string[], name = 'me'): ExecOutput {
    const r = spawnSync('git', [...FIXED_CONFIG, ...args], {
      cwd: this.dir(name),
      env: this.env,
      encoding: 'utf8',
    })
    if (r.error) throw r.error
    return { stdout: r.stdout, stderr: r.stderr, exitCode: r.status ?? -1 }
  }

  /** 成功する前提のコマンド。出力の末尾の改行は除く */
  git(args: string[], name = 'me'): string {
    const r = this.exec(args, name)
    if (r.exitCode !== 0) throw new Error(`git ${args.join(' ')} failed:\n${r.stderr}`)
    return r.stdout.trimEnd()
  }

  write(name: string, path: string, content: string): void {
    const full = join(this.dir(name), path)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, content)
  }

  remove(name: string, path: string): void {
    rmSync(join(this.dir(name), path))
  }

  run(steps: Step[]): this {
    for (const step of steps) {
      const name = ('in' in step ? step.in : undefined) ?? 'me'
      if (name !== '.') this.ensureDir(name)
      if ('git' in step)
        this.exec(
          step.git.map((a) => a.replaceAll('{root}', this.root)),
          name,
        )
      else if ('write' in step) this.write(name, step.write[0], step.write[1])
      else if ('remove' in step) this.remove(name, step.remove)
    }
    return this
  }

  /** 実際のパスを、シミュレータ側のパスに置き換える */
  normalize(text: string, simRoot: string): string {
    const windows = this.root.replaceAll('/', '\\')
    return text.replaceAll(this.root, simRoot).replaceAll(windows, simRoot)
  }

  isRepository(name: string): boolean {
    const d = this.dir(name)
    return existsSync(d) && this.exec(['rev-parse', '--git-dir'], name).exitCode === 0
  }

  snapshot(name: string, simRoot: string): Snapshot {
    const lines = (s: string) => (s === '' ? [] : s.split('\n'))
    const bare = this.git(['rev-parse', '--is-bare-repository'], name) === 'true'
    const symbolic = this.exec(['symbolic-ref', '-q', 'HEAD'], name)
    const head =
      symbolic.exitCode === 0
        ? `ref: ${symbolic.stdout.trim()}`
        : `detached: ${this.git(['rev-parse', 'HEAD'], name)}`
    const refs = lines(
      this.git(['for-each-ref', '--format=%(refname) %(objectname) %(symref)'], name),
    )
      .map((l) => l.trim())
      .sort()
    const hasCommits = refs.length > 0 || head.startsWith('detached')
    const commits = hasCommits
      ? lines(this.git(['rev-list', '--all', '--parents'], name)).sort()
      : []
    const config = lines(
      this.exec(
        ['config', '--local', '--get-regexp', '^(remote|branch)\\.'],
        name,
      ).stdout.trimEnd(),
    )
      .map((l) => this.normalize(l, simRoot))
      .sort()
    const merge = this.exec(['rev-parse', '-q', '--verify', 'MERGE_HEAD'], name).stdout.trim()
    if (bare) {
      return { bare, head, refs, commits, config, merge, index: [], worktree: {}, status: '' }
    }
    const index = lines(this.git(['ls-files', '-s'], name))
    const status = this.exec(['status', '--porcelain'], name).stdout
    return { bare, head, refs, commits, config, merge, index, worktree: this.files(name), status }
  }

  private files(name: string): Record<string, string> {
    const base = this.dir(name)
    const out: Record<string, string> = {}
    for (const e of readdirSync(base, { recursive: true, withFileTypes: true })) {
      if (!e.isFile()) continue
      const path = relative(base, join(e.parentPath, e.name)).replaceAll('\\', '/')
      if (path === '.git' || path.startsWith('.git/')) continue
      out[path] = readFileSync(join(base, path), 'utf8')
    }
    return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)))
  }

  dispose(): void {
    rmSync(this.home, { recursive: true, force: true })
  }
}
