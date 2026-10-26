import { describe, expect, it } from 'vitest'
import { type ExecContext, execute, type World } from '../../engine/index.ts'
import { runBeat } from '../npc.ts'
import { buildTeamWorld, TEAM_ACTORS, TEAM_BEATS, TEAM_PATHS } from './team.ts'

const now = { timestamp: 1_775_000_000, tzOffset: 540 }
const player = { name: 'あなた', email: 'you@example.com' }
const me = `${TEAM_PATHS.home}/team-project`
const ctx = (workspace: string): ExecContext => ({
  workspace,
  now,
  tty: false,
  home: TEAM_PATHS.home,
})

function run(world: World, workspace: string, ...lines: string[]) {
  let w = world
  let last = execute(w, '', ctx(workspace))
  for (const line of lines) {
    last = execute(w, line, ctx(workspace))
    expect(last.exitCode, `${line}\n${last.stderr}`).toBe(0)
    w = last.world
  }
  return last
}

const beat = (id: string) => TEAM_BEATS.find((b) => b.id === id) ?? (null as never)

describe('チームで練習', () => {
  it('プレイヤーはクローンして cd で入れる', () => {
    const w = buildTeamWorld(now, player)
    const cloned = run(w, TEAM_PATHS.home, `git clone ${TEAM_PATHS.origin}`, 'ls')
    expect(cloned.stdout).toBe('team-project\n')
    const cd = execute(cloned.world, 'cd team-project', ctx(TEAM_PATHS.home))
    expect(cd.cwd).toBe(me)
    expect(run(cd.world, me, 'git log --oneline').stdout).toMatch(/プロジェクトを作成/)
  })

  it('remote add の後の fetch で origin/HEAD が作られる（git 2.48 からの既定の動き）', () => {
    const w = buildTeamWorld(now, player)
    const r = run(
      w,
      TEAM_PATHS.home,
      'git init',
      `git remote add origin ${TEAM_PATHS.origin}`,
      'git fetch',
      'git branch -r',
    )
    expect(r.stdout).toBe('  origin/HEAD -> origin/main\n  origin/main\n')
    const never = run(
      w,
      TEAM_PATHS.home,
      'git init',
      `git remote add origin ${TEAM_PATHS.origin}`,
      'git config remote.origin.followRemoteHEAD never',
      'git fetch',
      'git branch -r',
    )
    expect(never.stdout).toBe('  origin/main\n')
  })

  it('同僚の push を pull で受け取れる', () => {
    let w = run(
      buildTeamWorld(now, player),
      TEAM_PATHS.home,
      `git clone ${TEAM_PATHS.origin}`,
    ).world
    for (const b of TEAM_BEATS.slice(0, 3)) {
      const r = runBeat(w, b, TEAM_ACTORS, now)
      expect(r.failed).toBeNull()
      w = r.world
    }
    const status = run(w, me, 'git fetch', 'git status -sb')
    expect(status.stdout).toBe('## main...origin/main [behind 2]\n')
    const pulled = run(status.world, me, 'git pull', 'git log --oneline')
    expect(pulled.stdout).toMatch(/設定ファイルを追加/)
    const branches = run(pulled.world, me, 'git branch -r')
    expect(branches.stdout).toContain('origin/feature/login')
  })

  it('force push で同僚のコミットを消すと、誰のコミットが消えたかがイベントで分かる', () => {
    let w = run(
      buildTeamWorld(now, player),
      TEAM_PATHS.home,
      `git clone ${TEAM_PATHS.origin}`,
    ).world
    w = runBeat(w, beat('kouhai-readme'), TEAM_ACTORS, now).world
    const mine = run(w, me, 'git commit --allow-empty -m mine', 'git push --force')
    expect(mine.events).toContainEqual(
      expect.objectContaining({
        type: 'FORCE_PUSH_OVERWROTE',
        branch: 'main',
        authors: ['後輩 田中'],
      }),
    )
    // 消された側の後輩が次に push しようとすると拒否される
    const next = runBeat(mine.world, beat('kouhai-feature'), TEAM_ACTORS, now)
    expect(next.failed).toBeNull()
    const env = runBeat(next.world, beat('kouhai-env'), TEAM_ACTORS, now)
    expect(env.failed?.command).toBe('git pull')
  })

  it('先に push されていると拒否され、PUSH_REJECTED が出る', () => {
    let w = run(
      buildTeamWorld(now, player),
      TEAM_PATHS.home,
      `git clone ${TEAM_PATHS.origin}`,
    ).world
    w = runBeat(w, beat('kouhai-readme'), TEAM_ACTORS, now).world
    const r = execute(run(w, me, 'git commit --allow-empty -m mine').world, 'git push', ctx(me))
    expect(r.exitCode).toBe(1)
    expect(r.events).toContainEqual(
      expect.objectContaining({ type: 'PUSH_REJECTED', branch: 'main', reason: 'fetch-first' }),
    )
  })
})
