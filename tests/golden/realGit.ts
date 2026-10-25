// 本物のgitを、作者・日時・設定を固定した状態で実行する（docs/05 §2.2）。
// シミュレータとの突き合わせテストは、この結果を正として比べる。
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

export type Step = { git: string[] } | { write: { path: string; content: string } }

const FIXED_IDENTITY = {
  GIT_AUTHOR_NAME: 'Sensei',
  GIT_AUTHOR_EMAIL: 'sensei@example.com',
  GIT_AUTHOR_DATE: '2026-04-01T09:00:00+09:00',
  GIT_COMMITTER_NAME: 'Sensei',
  GIT_COMMITTER_EMAIL: 'sensei@example.com',
  GIT_COMMITTER_DATE: '2026-04-01T09:00:00+09:00',
}

// 利用者の ~/.gitconfig や OS の設定に結果が左右されないようにする
const FIXED_CONFIG = ['-c', 'core.autocrlf=false', '-c', 'init.defaultBranch=main']

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

  git(...args: string[]): string {
    return execFileSync('git', [...FIXED_CONFIG, ...args], {
      cwd: this.dir,
      env: this.env,
      encoding: 'utf8',
    }).trimEnd()
  }

  write(path: string, content: string): void {
    const full = join(this.dir, path)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, content)
  }

  run(steps: Step[]): this {
    for (const step of steps) {
      if ('git' in step) this.git(...step.git)
      else this.write(step.write.path, step.write.content)
    }
    return this
  }

  dispose(): void {
    rmSync(dirname(this.dir), { recursive: true, force: true })
  }
}
