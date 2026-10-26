// 危険の判定と、エンジン＋演出エンジンを通しで動かしたときの振る舞い。
import { describe, expect, it } from 'vitest'
import {
  type Cue,
  type DramaSettings,
  type DramaState,
  initDrama,
  stepDrama,
} from '../drama/index.ts'
import { type ExecContext, execute, stateHash, type World, writeFile } from '../engine/index.ts'
import { type DangerPolicy, detectDangers, matchesPattern } from './dangers.ts'
import { commandInput } from './dramaInput.ts'
import { runBeat } from './npc.ts'
import { buildTeamWorld, TEAM_ACTORS, TEAM_BEATS, TEAM_PATHS } from './sandbox/team.ts'

const now = { timestamp: 1_775_000_000, tzOffset: 540 }
const player = { name: 'あなた', email: 'you@example.com' }
const me = `${TEAM_PATHS.home}/team-project`
const ctx = (workspace: string): ExecContext => ({
  workspace,
  now,
  tty: false,
  home: TEAM_PATHS.home,
})
const policy: DangerPolicy = { player: player.name, protectedBranches: ['main'] }

function cloned(): World {
  const r = execute(
    buildTeamWorld(now, player),
    `git clone ${TEAM_PATHS.origin}`,
    ctx(TEAM_PATHS.home),
  )
  return r.world
}

function run(world: World, line: string) {
  const r = execute(world, line, ctx(me))
  return { ...r, dangers: detectDangers(r.world, me, r.events, line, policy) }
}

const kinds = (r: { dangers: { kind: string }[] }) => r.dangers.map((d) => d.kind)
const beat = (id: string) => TEAM_BEATS.find((b) => b.id === id) ?? (null as never)

describe('matchesPattern', () => {
  it('ファイル名・ディレクトリ・ワイルドカード', () => {
    expect(matchesPattern('.env', '.env')).toBe(true)
    expect(matchesPattern('config/.env', '.env')).toBe(true)
    expect(matchesPattern('.env.local', '.env.*')).toBe(true)
    expect(matchesPattern('keys/server.pem', '*.pem')).toBe(true)
    expect(matchesPattern('node_modules/a/index.js', 'node_modules/')).toBe(true)
    expect(matchesPattern('web/node_modules/x.js', 'node_modules/')).toBe(true)
    expect(matchesPattern('src/env.ts', '.env')).toBe(false)
  })
})

describe('detectDangers', () => {
  it('.env を含むコミットを push すると SECRET_PUSHED（守るべき main への直接 push も）', () => {
    let w = cloned()
    w = writeFile(w, me, '.env', 'API_KEY=secret\n')
    w = run(w, 'git add .').world
    w = run(w, "git commit -m '設定を追加'").world
    const pushed = run(w, 'git push')
    expect(kinds(pushed)).toEqual(['DIRECT_PUSH_TO_PROTECTED', 'SECRET_PUSHED'])
    expect(pushed.dangers.find((d) => d.kind === 'SECRET_PUSHED')?.detail).toBe('.env')
  })

  it('他人のコミットを force push で消すと FORCE_PUSH_OVERWROTE、自分のだけなら履歴の書き換え', () => {
    let w = runBeat(cloned(), beat('kouhai-readme'), TEAM_ACTORS, now).world
    w = run(w, 'git commit --allow-empty -m 自分の作業').world
    const overwrote = run(w, 'git push --force')
    expect(kinds(overwrote)).toEqual(['FORCE_PUSH_OVERWROTE'])
    expect(overwrote.dangers[0]?.detail).toBe('後輩 田中')

    w = run(overwrote.world, "git commit --amend -m '自分の作業（直した）'").world
    expect(kinds(run(w, 'git push --force'))).toEqual(['HISTORY_REWRITTEN_ON_SHARED_BRANCH'])
  })

  it('質の低いコミットメッセージと、node_modules の add', () => {
    let w = writeFile(cloned(), me, 'node_modules/lib/index.js', 'x\n')
    const added = run(w, 'git add .')
    expect(kinds(added)).toEqual(['JUNK_STAGED'])
    w = added.world
    expect(kinds(run(w, 'git commit -m 修正'))).toEqual(['BAD_COMMIT_MESSAGE'])
  })

  it('シナリオが許可した危険は allowed になる', () => {
    let w = runBeat(cloned(), beat('kouhai-readme'), TEAM_ACTORS, now).world
    w = run(w, 'git commit --allow-empty -m 自分の作業').world
    const r = execute(w, 'git push --force', ctx(me))
    const dangers = detectDangers(r.world, me, r.events, 'git push --force', {
      ...policy,
      allow: (kind) => kind === 'FORCE_PUSH_OVERWROTE',
    })
    expect(dangers).toEqual([{ kind: 'FORCE_PUSH_OVERWROTE', allowed: true, detail: '後輩 田中' }])
  })
})

describe('stateHash', () => {
  it('同じ状態に戻れば同じハッシュ。オブジェクトが増えても関係ない', () => {
    const w = cloned()
    const created = execute(w, 'git branch tmp', ctx(me)).world
    const deleted = execute(created, 'git branch -d tmp', ctx(me)).world
    expect(stateHash(created)).not.toBe(stateHash(w))
    expect(stateHash(deleted)).toBe(stateHash(w))
  })
})

describe('エンジンと演出エンジンを通しで動かす', () => {
  const settings: DramaSettings = {
    mode: 'practice',
    cast: ['kouhai', 'boss'],
    par: 2,
    untimed: true,
    seed: 7,
  }

  function session(world: World, lines: string[]) {
    let w = world
    let { state, cues } = initDrama(settings, stateHash(w))
    const all: Cue[] = [...cues]
    lines.forEach((line, i) => {
      const result = execute(w, line, ctx(me))
      w = result.world
      const input = commandInput({ command: line, workspace: me, result, at: i * 1000, policy })
      const r = stepDrama(state as DramaState, input, settings)
      state = r.state
      all.push(...r.cues)
    })
    return { state, cues: all }
  }

  it('作って消すだけの操作は後退、変化のない切り替えは空振りとして数える', () => {
    const { state } = session(cloned(), [
      'git branch tmp',
      'git branch -d tmp',
      'git switch main',
      'git status',
    ])
    expect(state.trust).toBe(80 - 6 - 4)
    expect(state.moves).toBe(3)
  })

  it('ブランチを作って行き来しても、ブランチが残るので後退ではない', () => {
    const { state } = session(cloned(), ['git switch -c topic', 'git switch main'])
    expect(state.trust).toBe(80)
  })

  it('後輩のコミットを force push で消すと、上司の雷が近づく', () => {
    const w = runBeat(cloned(), beat('kouhai-readme'), TEAM_ACTORS, now).world
    const { state, cues } = session(w, [
      'git commit --allow-empty -m 自分の作業',
      'git push --force',
    ])
    expect(state.mood).toBe(5)
    expect(cues).toContainEqual({ type: 'report', kind: 'FORCE_PUSH_OVERWROTE' })
    expect(cues).toContainEqual({ type: 'cutin', who: 'boss', variant: 'rage' })
  })
})
