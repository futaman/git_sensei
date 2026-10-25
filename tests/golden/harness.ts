// 同じ手順を本物のgitとシミュレータの両方で実行し、結果を比べる（docs/05 §2.2）。
import { expect } from 'vitest'
import {
  createWorld,
  deleteFile,
  type ExecContext,
  execute,
  type GitDir,
  type World,
  writeFile,
} from '../../src/engine/index.ts'
import { FIXED_DATE, RealGitRepo } from './realGit.ts'

export type Step =
  /** git のサブコマンド以降の引数。compare に挙げた出力も比べる */
  | { git: string[]; compare?: ('stdout' | 'stderr')[] }
  | { write: [path: string, content: string] }
  | { remove: string }
  /** この時点の状態を比べる（最後の状態はいつも比べる） */
  | { check: true }

/** 比べる状態。本物のgitからは git コマンドで、シミュレータからは World から取り出す */
export interface Snapshot {
  head: string
  refs: string[]
  commits: string[]
  index: string[]
  worktree: Record<string, string>
  status: string
}

const WS = 'repo'
const ctx: ExecContext = {
  workspace: WS,
  now: { timestamp: Date.parse(FIXED_DATE) / 1000, tzOffset: 9 * 60 },
  tty: false,
}

/** シミュレータに渡す1行。空白やクォートを含む引数はシングルクォートで囲む */
export function toCommandLine(args: string[]): string {
  const quote = (a: string) =>
    a !== '' && /^[\w@%+=:,./~^-]+$/.test(a) ? a : `'${a.replaceAll("'", `'\\''`)}'`
  return ['git', ...args.map(quote)].join(' ')
}

function simSnapshot(world: World): Snapshot {
  const ws = world.workspaces[WS]
  if (!ws) throw new Error('workspace missing')
  const git = ws.git as GitDir
  const head = git.head.type === 'symbolic' ? `ref: ${git.head.ref}` : `detached: ${git.head.oid}`
  const refs = Object.entries(git.refs)
    .filter(([r]) => r.startsWith('refs/heads/'))
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([r, oid]) => `${r} ${oid}`)

  const commits = new Set<string>()
  const stack = [
    ...Object.values(git.refs),
    ...(git.head.type === 'detached' ? [git.head.oid] : []),
  ]
  const lines: string[] = []
  while (stack.length > 0) {
    const oid = stack.pop() as string
    if (commits.has(oid)) continue
    commits.add(oid)
    const c = git.objects[oid]
    if (c?.type !== 'commit') throw new Error(`${oid} is not a commit`)
    lines.push([oid, ...c.parents].join(' '))
    stack.push(...c.parents)
  }
  const index = Object.entries(git.index)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([path, e]) => `${e.mode} ${e.oid} 0\t${path}`)
  const worktree = Object.fromEntries(Object.entries(ws.files).sort(([a], [b]) => (a < b ? -1 : 1)))
  const status = execute(world, 'git status --porcelain', ctx).stdout
  return { head, refs, commits: lines.sort(), index, worktree, status }
}

/** 手順を両方で実行し、終了コード・指定した出力・状態が一致することを確かめる */
export function expectSameAsRealGit(steps: Step[]): void {
  const real = new RealGitRepo()
  let world = createWorld(
    { [WS]: { path: '/home/sensei/repo' } },
    { 'user.name': 'Sensei', 'user.email': 'sensei@example.com' },
  )
  try {
    steps.forEach((step, i) => {
      const where = `手順 ${i + 1}`
      if ('write' in step) {
        real.write(...step.write)
        world = writeFile(world, WS, ...step.write)
      } else if ('remove' in step) {
        real.remove(step.remove)
        world = deleteFile(world, WS, step.remove)
      } else if ('check' in step) {
        expect(simSnapshot(world), `${where} の状態`).toEqual(real.snapshot())
      } else {
        const line = toCommandLine(step.git)
        const expected = real.exec(step.git)
        const actual = execute(world, line, ctx)
        world = actual.world
        expect(actual.unsupported, `${where}: ${line} はシミュレータで未対応`).toBeUndefined()
        expect(
          actual.exitCode,
          `${where}: ${line} の終了コード\n本物のstderr: ${expected.stderr}\nシミュレータのstderr: ${actual.stderr}`,
        ).toBe(expected.exitCode)
        for (const stream of step.compare ?? []) {
          expect(actual[stream], `${where}: ${line} の ${stream}`).toBe(expected[stream])
        }
      }
    })
    expect(simSnapshot(world), '最後の状態').toEqual(real.snapshot())
  } finally {
    real.dispose()
  }
}
