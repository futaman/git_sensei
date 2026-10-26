// 同じ手順を本物のgitとシミュレータの両方で実行し、結果を比べる（docs/05 §2.2）。
// 複数のリポジトリ（me, npc, origin.git など）を扱える。どのリポジトリで実行するかは in で指定する。
import { expect } from 'vitest'
import {
  addWorkspace,
  createWorld,
  deleteFile,
  type ExecContext,
  execute,
  findWorkspace,
  type GitDir,
  type IndexEntry,
  type World,
  writeFile,
} from '../../src/engine/index.ts'
import {
  FIXED_DATE,
  FOLLOW_REMOTE_HEAD,
  gitCreatesRemoteHead,
  IDENTITY,
  RealGitRepo,
} from './realGit.ts'

// シミュレータを、インストールされている git と同じ fetch の動きにする（realGit.ts の説明を参照）
const SIM_FOLLOW_REMOTE_HEAD: Record<string, string> = gitCreatesRemoteHead()
  ? {}
  : { [FOLLOW_REMOTE_HEAD]: 'never' }

/** in を省略すると 'me'。'.' は作業場所のルート（clone を実行する場所） */
type Where = { in?: string }

export type Step =
  /** git のサブコマンド以降の引数。{root} は作業場所のルートに置き換わる。compare に挙げた出力も比べる */
  | ({ git: string[]; compare?: ('stdout' | 'stderr')[] } & Where)
  | ({ write: [path: string, content: string] } & Where)
  | ({ remove: string } & Where)
  /** この時点の状態を比べる（最後の状態はいつも比べる） */
  | { check: true }

/** 比べる状態。本物のgitからは git コマンドで、シミュレータからは World から取り出す */
export interface Snapshot {
  bare: boolean
  head: string
  /** "refname oid symref" */
  refs: string[]
  commits: string[]
  /** remote.* と branch.* の設定（"key value"） */
  config: string[]
  /** マージの途中なら MERGE_HEAD のコミット */
  merge: string
  /** "mode oid stage	path"（コンフリクト中は stage 1〜3） */
  index: string[]
  worktree: Record<string, string>
  status: string
}

// シミュレータ側の作業場所。本物と同じ実際のパスにする（pull のマージメッセージなどにパスが入り、
// ハッシュ値まで比べるため）。テストごとに expectSameAsRealGit の最初で決まる
let SIM_ROOT = '/work'
const simPath = (name: string) => (name === '.' ? SIM_ROOT : `${SIM_ROOT}/${name}`)
const ctxFor = (name: string): ExecContext => ({
  workspace: simPath(name),
  now: { timestamp: Date.parse(FIXED_DATE) / 1000, tzOffset: 9 * 60 },
  tty: false,
})

/**
 * git のバージョンで文言が違う出力を、新しい版の文言にそろえる（シミュレータは新しい版に合わせている）
 */
function compatible(text: string): string {
  return text.replaceAll(
    '(use "git pull" to merge the remote branch into yours)',
    '(use "git pull" if you want to integrate the remote branch with yours)',
  )
}

/** シミュレータに渡す1行。空白やクォートを含む引数はシングルクォートで囲む */
export function toCommandLine(args: string[]): string {
  const quote = (a: string) =>
    a !== '' && /^[\w@%+=:,./~^{}-]+$/.test(a) ? a : `'${a.replaceAll("'", `'\\''`)}'`
  return ['git', ...args.map(quote)].join(' ')
}

function simSnapshot(world: World, name: string): Snapshot {
  const hit = findWorkspace(world, simPath(name))
  if (!hit?.[1].git) throw new Error(`${name} はリポジトリではありません`)
  const [key, ws] = hit
  const git = ws.git as GitDir
  const head = git.head.type === 'symbolic' ? `ref: ${git.head.ref}` : `detached: ${git.head.oid}`
  const refs = [
    ...Object.entries(git.refs).map(([r, oid]) => `${r} ${oid}`),
    ...Object.entries(git.symrefs).map(([r, target]) => `${r} ${git.refs[target] ?? ''} ${target}`),
  ].sort((a, b) => (a < b ? -1 : 1))

  const seen = new Set<string>()
  const stack = [
    ...Object.values(git.refs),
    ...(git.head.type === 'detached' ? [git.head.oid] : []),
  ]
  const commits: string[] = []
  while (stack.length > 0) {
    const oid = stack.pop() as string
    if (seen.has(oid)) continue
    seen.add(oid)
    const c = git.objects[oid]
    if (c?.type !== 'commit') throw new Error(`${oid} is not a commit`)
    commits.push([oid, ...c.parents].join(' '))
    stack.push(...c.parents)
  }
  const config = Object.entries(git.config)
    .filter(([k]) => /^(remote|branch)\./.test(k))
    .map(([k, v]) => `${k} ${v}`)
    .sort()
  if (git.bare) {
    return {
      bare: true,
      head,
      refs,
      commits: commits.sort(),
      config,
      merge: '',
      index: [],
      worktree: {},
      status: '',
    }
  }
  const index = [
    ...Object.entries(git.index).map(([path, e]) => ({ path, stage: 0, e })),
    ...Object.entries(git.unmerged).flatMap(([path, u]) =>
      ([1, 2, 3] as const)
        .map((stage) => ({ path, stage, e: [u.base, u.ours, u.theirs][stage - 1] }))
        .filter((x): x is { path: string; stage: 1 | 2 | 3; e: IndexEntry } => !!x.e),
    ),
  ]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.stage - b.stage))
    .map(({ path, stage, e }) => `${e.mode} ${e.oid} ${stage}\t${path}`)
  const worktree = Object.fromEntries(Object.entries(ws.files).sort(([a], [b]) => (a < b ? -1 : 1)))
  const status = execute(world, 'git status --porcelain', {
    ...ctxFor(name),
    workspace: key,
  }).stdout
  const merge = git.merge?.head ?? ''
  return {
    bare: false,
    head,
    refs,
    commits: commits.sort(),
    config,
    merge,
    index,
    worktree,
    status,
  }
}

/** シミュレータ側で git リポジトリになっているワークスペースの名前 */
function repoNames(world: World): string[] {
  return Object.values(world.workspaces)
    .filter((ws) => ws.git && ws.path.startsWith(`${SIM_ROOT}/`))
    .map((ws) => ws.path.slice(SIM_ROOT.length + 1))
    .sort()
}

function compareAll(world: World, real: RealGitRepo, label: string): void {
  const names = repoNames(world)
  for (const name of names) {
    expect(real.isRepository(name), `${label}：${name} は本物でもリポジトリ`).toBe(true)
    expect(simSnapshot(world, name), `${label}：${name} の状態`).toEqual(
      real.snapshot(name, SIM_ROOT),
    )
  }
}

/** 手順を両方で実行し、終了コード・指定した出力・状態が一致することを確かめる */
export function expectSameAsRealGit(steps: Step[]): void {
  const real = new RealGitRepo()
  SIM_ROOT = real.root
  let world = createWorld(
    { [SIM_ROOT]: { path: SIM_ROOT } },
    {
      'user.name': IDENTITY.name,
      'user.email': IDENTITY.email,
      ...SIM_FOLLOW_REMOTE_HEAD,
    },
  )
  try {
    steps.forEach((step, i) => {
      const where = `手順 ${i + 1}`
      if ('check' in step) {
        compareAll(world, real, `${where} の時点`)
        return
      }
      const name = step.in ?? 'me'
      if (name !== '.') {
        real.ensureDir(name)
        world = addWorkspace(world, simPath(name))
      }
      const key = findWorkspace(world, simPath(name))?.[0] as string
      if ('write' in step) {
        real.write(name, ...step.write)
        world = writeFile(world, key, ...step.write)
      } else if ('remove' in step) {
        real.remove(name, step.remove)
        world = deleteFile(world, key, step.remove)
      } else {
        const realArgs = step.git.map((a) => a.replaceAll('{root}', real.root))
        const simArgs = step.git.map((a) => a.replaceAll('{root}', SIM_ROOT))
        const line = toCommandLine(simArgs)
        const expected = real.exec(realArgs, name)
        const actual = execute(world, line, { ...ctxFor(name), workspace: key })
        world = actual.world
        expect(
          actual.unsupported,
          `${where}: ${line}（${name}）はシミュレータで未対応`,
        ).toBeUndefined()
        expect(
          actual.exitCode,
          `${where}: ${line}（${name}）の終了コード\n本物のstderr: ${expected.stderr}\nシミュレータのstderr: ${actual.stderr}`,
        ).toBe(expected.exitCode)
        for (const stream of step.compare ?? []) {
          expect(actual[stream], `${where}: ${line}（${name}）の ${stream}`).toBe(
            compatible(real.normalize(expected[stream], SIM_ROOT)),
          )
        }
      }
    })
    compareAll(world, real, '最後')
  } finally {
    real.dispose()
  }
}
