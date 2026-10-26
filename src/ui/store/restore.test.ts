// 壊れた保存データから起動しても、白い画面にならない（検証レポート B2）。
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  addWorkspace,
  createWorld,
  type ExecContext,
  execute,
  fileStates,
  own,
  remoteSummaries,
  repoView,
  type World,
  writeFile,
} from '../../engine/index.ts'
import { buildTeamWorld } from '../../scenarios/sandbox/team.ts'
import { restoreSaved } from './restore.ts'

const HOME = '/home/you'
const PROJECT = `${HOME}/my-project`
const ORIGIN = '/srv/git/origin.git'
const COPY = `${HOME}/copy`
const NOW = { timestamp: 1_775_000_000, tzOffset: 540 }
const ctx = (workspace: string): ExecContext => ({ workspace, now: NOW, tty: true, home: HOME })

function run(world: World, workspace: string, ...lines: string[]): World {
  let w = world
  for (const line of lines) {
    const r = execute(w, line, ctx(workspace))
    expect(r.exitCode, `${line}\n${r.stderr}`).toBe(0)
    w = r.world
  }
  return w
}

/** リモート（bare）に push し、別のフォルダに clone したところ */
function sampleWorld(): World {
  let w = createWorld(
    { [HOME]: { path: HOME }, [PROJECT]: { path: PROJECT, files: { 'a.txt': 'a\n' } } },
    { 'user.name': 'あなた', 'user.email': 'you@example.com' },
  )
  // オブジェクトリテラルの __proto__ はプロトタイプの指定になるので、writeFile で作る
  w = writeFile(w, PROJECT, '__proto__', 'p\n')
  w = addWorkspace(w, ORIGIN)
  w = run(w, ORIGIN, 'git init --bare')
  w = run(
    w,
    PROJECT,
    'git init',
    'git add .',
    'git commit -m first',
    `git remote add origin ${ORIGIN}`,
    'git push -u origin main',
  )
  return run(w, HOME, `git clone ${ORIGIN} copy`)
}

/** localStorage に保存されるのと同じ JSON を通した形 */
const roundTrip = <T>(v: T): unknown => JSON.parse(JSON.stringify(v))

function saved(world: unknown, rest: Record<string, unknown> = {}) {
  return roundTrip({
    preset: 'solo',
    world,
    cwd: PROJECT,
    lines: [{ id: 0, kind: 'npc', text: 'hi' }],
    history: ['git init'],
    events: [
      {
        id: 1,
        actor: null,
        event: { type: 'REPO_INITIALIZED', reinitialized: false },
        command: 'x',
      },
    ],
    selectedFile: 'a.txt',
    nextId: 2,
    beat: 0,
    ...rest,
  })
}

/** JSON を通した world の一部を書き換える */
function corrupt(edit: (w: World) => void): unknown {
  const w = roundTrip(sampleWorld()) as World
  edit(w)
  return saved(w)
}

describe('restoreSaved', () => {
  it('リモートと clone を含む保存データを戻し、続きを実行できる', () => {
    const r = restoreSaved(saved(sampleWorld()))
    expect(r?.cwd).toBe(PROJECT)
    expect(r?.lines).toHaveLength(1)
    expect(r?.events).toHaveLength(1)
    const world = r?.world as World
    const project = own(world.workspaces, PROJECT)
    if (!project) throw new Error('project missing')
    expect(own(project.files, '__proto__')).toBe('p\n')
    expect(remoteSummaries(world, project).map((s) => s.name)).toEqual(['origin'])

    // '__proto__' という名前のファイルを、読み込んだあとも書き換えて push / pull できる
    let w = writeFile(world, PROJECT, '__proto__', 'changed\n')
    w = run(w, PROJECT, 'git commit -am second', 'git push')
    w = run(w, COPY, 'git pull')
    expect(execute(w, 'cat __proto__', ctx(COPY)).stdout).toBe('changed\n')
  })

  it('マージのコンフリクトで止まっている保存データも戻せる', () => {
    let w = run(sampleWorld(), PROJECT, 'git switch -c side')
    w = writeFile(w, PROJECT, 'a.txt', 'side\n')
    w = run(w, PROJECT, 'git commit -am side', 'git switch main')
    w = writeFile(w, PROJECT, 'a.txt', 'main\n')
    w = run(w, PROJECT, 'git commit -am main')
    w = execute(w, 'git merge side', ctx(PROJECT)).world
    const r = restoreSaved(saved(w))
    const world = r?.world as World
    const git = own(world.workspaces, PROJECT)?.git
    expect(git && Object.keys(git.unmerged)).toEqual(['a.txt'])
    expect(execute(world, 'git status --short', ctx(PROJECT)).stdout).toContain('UU a.txt')
  })

  it('チームで練習の保存データも戻せる', () => {
    const team = buildTeamWorld(NOW, { name: 'あなた', email: 'you@example.com' })
    const r = restoreSaved(saved(team, { preset: 'team', cwd: HOME, beat: 2 }))
    expect(r?.preset).toBe('team')
    expect(r?.beat).toBe(2)
    expect(Object.keys(r?.world?.workspaces ?? {}).length).toBeGreaterThan(1)
  })

  it.each([
    ['null', null],
    ['文字列', 'broken'],
    ['world がない', { cwd: PROJECT, lines: [] }],
    ['cwd のワークスペースがない', saved({ workspaces: {}, globalConfig: {} })],
    [
      'ファイルの中身が文字列でない',
      saved({
        workspaces: { [PROJECT]: { path: PROJECT, files: { a: 5 }, git: null } },
        globalConfig: {},
      }),
    ],
    [
      'マージ対応より前の形（unmerged と merge がない）',
      corrupt((w) => {
        const git = own(w.workspaces, PROJECT)?.git as unknown as Record<string, unknown>
        delete git.unmerged
        delete git.merge
      }),
    ],
    [
      'M2 の形（symrefs と bare がない）',
      corrupt((w) => {
        const git = own(w.workspaces, PROJECT)?.git as unknown as Record<string, unknown>
        delete git.symrefs
        delete git.bare
      }),
    ],
  ])('形が壊れていれば捨てる（%s）', (_, data) => {
    expect(restoreSaved(roundTrip(data))).toBeNull()
  })

  it('存在しないコミットを指すブランチ（repoView が失敗する）は捨てる', () => {
    const data = corrupt((w) => {
      const git = own(w.workspaces, PROJECT)?.git
      if (git) git.refs['refs/heads/side'] = 'f'.repeat(40)
    })
    expect(restoreSaved(data)).toBeNull()
  })

  it('リモート（bare）のブランチが存在しないコミットを指すなら捨てる', () => {
    const data = corrupt((w) => {
      const origin = own(w.workspaces, ORIGIN)?.git
      if (origin) origin.refs['refs/heads/main'] = 'f'.repeat(40)
    })
    expect(restoreSaved(data)).toBeNull()
  })

  it('HEAD が存在しないコミットを指す（fileStates が失敗する）なら捨てる', () => {
    const data = corrupt((w) => {
      const git = own(w.workspaces, PROJECT)?.git
      if (git) git.head = { type: 'detached', oid: 'nope' }
    })
    expect(restoreSaved(data)).toBeNull()
  })

  it('world が正しければ、壊れたできごとや行だけを捨てる', () => {
    const r = restoreSaved(
      saved(sampleWorld(), {
        lines: [{ id: 'x' }],
        events: [{ id: 5, actor: null, event: { type: 'FILES_STAGED' }, command: 'git add' }],
        nextId: 'oops',
        preset: 'party',
      }),
    )
    expect(r?.world).toBeDefined()
    expect(r?.lines).toBeUndefined()
    expect(r?.events).toBeUndefined()
    expect(r?.preset).toBeUndefined()
    expect(r?.nextId).toBe(3)
  })
})

describe('フリーモードの起動', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  async function bootWith(raw: string) {
    const store = new Map([['git-sensei:free-mode', raw]])
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    })
    vi.resetModules()
    const { useFreeMode } = await import('./freeMode.ts')
    return useFreeMode.getState()
  }

  it('壊れた保存データなら初期状態で始まり、画面の問い合わせが通る', async () => {
    const data = corrupt((w) => {
      const git = own(w.workspaces, PROJECT)?.git
      if (git) git.refs['refs/heads/main'] = 'f'.repeat(40)
    })
    const state = await bootWith(JSON.stringify({ state: data, version: 3 }))
    const ws = own(state.world.workspaces, state.cwd)
    expect(ws?.git).toBeNull()
    expect(ws && fileStates(ws).map((f) => f.path)).toEqual(['README.md', 'src/app.js'])
  })

  it('JSON として読めない保存データでも起動できる', async () => {
    const state = await bootWith('{not json')
    expect(own(state.world.workspaces, state.cwd)?.git).toBeNull()
  })

  it('正しい保存データ（リモートあり）は読み込まれる', async () => {
    const state = await bootWith(JSON.stringify({ state: saved(sampleWorld()), version: 3 }))
    expect(state.cwd).toBe(PROJECT)
    const git = own(state.world.workspaces, PROJECT)?.git
    expect(git && repoView(git).commits).toHaveLength(1)
    expect(state.history).toEqual(['git init'])
  })
})
