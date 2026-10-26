// ステージを作るための道具：world の組み立て、NPC の操作、リポジトリの中身の読み出し。

import {
  addWorkspace,
  createWorld,
  type ExecContext,
  execute,
  findWorkspace,
  type GitDir,
  hasConflictMarkers,
  own,
  type World,
  writeFile,
} from '../engine/index.ts'
import { DEFAULT_BAD_MESSAGES } from './dangers.ts'
import type { Chip } from './stage.ts'

export const HOME = '/home/you'
export const PLAYER = { name: 'あなた', email: 'you@example.com' }

export const PEOPLE = {
  tanaka: { name: '田中', email: 'tanaka@example.com' },
  hayase: { name: '早瀬', email: 'hayase@example.com' },
  kuroiwa: { name: '黒岩', email: 'kuroiwa@example.com' },
} as const

export type Person = keyof typeof PEOPLE

/** 準備のコマンドが失敗したら、ステージの作りの間違い */
function must(world: World, line: string, workspace: string, now: ExecContext['now']): World {
  const r = execute(world, line, { workspace, now, tty: false })
  if (r.exitCode !== 0)
    throw new Error(`ステージの準備に失敗：${line}（${workspace}）\n${r.stderr}`)
  return r.world
}

/**
 * world を組み立てる。時刻は「開始の何分前か」で指定する（グラフや log の並びに効く）。
 * at(minutesBefore) を省くと、直前に使った時刻のまま
 */
export class WorldBuilder {
  world: World
  private readonly now: ExecContext['now']
  private minutes = 60

  constructor(now: ExecContext['now'], dirs: string[] = [HOME]) {
    this.now = now
    this.world = createWorld(Object.fromEntries(dirs.map((d) => [d, { path: d }])), {
      'user.name': PLAYER.name,
      'user.email': PLAYER.email,
    })
  }

  /** 次からのコマンドを、開始の minutesBefore 分前に打ったことにする */
  at(minutesBefore: number): this {
    this.minutes = minutesBefore
    return this
  }

  /** 決まった時刻（その日の何時何分。前日なら dayOffset -1）に打ったことにする */
  atClock(hhmm: string, dayOffset = 0): this {
    const [h = 0, m = 0] = hhmm.split(':').map(Number)
    const local = this.now.timestamp + this.now.tzOffset * 60
    const midnight = local - (local % 86400)
    const target = midnight + dayOffset * 86400 + h * 3600 + m * 60 - this.now.tzOffset * 60
    this.minutes = (this.now.timestamp - target) / 60
    return this
  }

  private time(): ExecContext['now'] {
    return { ...this.now, timestamp: Math.round(this.now.timestamp - this.minutes * 60) }
  }

  dir(path: string): this {
    this.world = addWorkspace(this.world, path)
    return this
  }

  run(workspace: string, ...lines: string[]): this {
    for (const line of lines) this.world = must(this.world, line, workspace, this.time())
    return this
  }

  /** 失敗してもよいコマンド（コンフリクトするマージなど）。終了コードは見ない */
  tryRun(workspace: string, ...lines: string[]): this {
    for (const line of lines) {
      this.world = execute(this.world, line, { workspace, now: this.time(), tty: false }).world
    }
    return this
  }

  write(workspace: string, files: Record<string, string>): this {
    for (const [path, content] of Object.entries(files)) {
      this.world = writeFile(this.world, workspace, path, content)
    }
    return this
  }

  /** 人物の名前とメールを、そのリポジトリの設定にする */
  as(workspace: string, person: Person): this {
    const p = PEOPLE[person]
    return this.run(
      workspace,
      `git config user.name '${p.name}'`,
      `git config user.email ${p.email}`,
    )
  }

  /** サーバー（bare リポジトリ）を作る */
  server(path: string): this {
    return this.dir(path).run(path, 'git init --bare')
  }

  /** 人物のリポジトリを、最初のコミットつきで作って origin に push する */
  founder(
    workspace: string,
    person: Person,
    origin: string,
    files: Record<string, string>,
    message: string,
  ): this {
    return this.dir(workspace)
      .run(workspace, 'git init')
      .as(workspace, person)
      .write(workspace, files)
      .run(
        workspace,
        'git add .',
        `git commit -m '${message}'`,
        `git remote add origin ${origin}`,
        'git push -u origin main',
      )
  }

  /** ファイルを書いて、コミットする（add は全部） */
  commit(workspace: string, files: Record<string, string>, message: string): this {
    return this.write(workspace, files).run(workspace, 'git add -A', `git commit -m '${message}'`)
  }

  build(): World {
    return this.world
  }
}

export const repo = (world: World, path: string): GitDir | null =>
  findWorkspace(world, path)?.[1].git ?? null

export const worktree = (world: World, path: string): Record<string, string> =>
  findWorkspace(world, path)?.[1].files ?? {}

export const fileOf = (world: World, path: string, file: string): string | undefined =>
  own(worktree(world, path), file)

/** ブランチの先端（refs/heads/<name>）。なければ null */
export function tipOf(git: GitDir | null, branch: string): string | null {
  if (!git) return null
  const ref = `refs/heads/${branch}`
  return Object.hasOwn(git.refs, ref) ? (git.refs[ref] as string) : null
}

/** あるコミットの、あるファイルの中身 */
export function fileAt(git: GitDir, commitOid: string, path: string): string | undefined {
  let tree = git.objects[commitOid]
  if (tree?.type !== 'commit') return undefined
  tree = git.objects[tree.tree]
  const parts = path.split('/')
  for (const [i, name] of parts.entries()) {
    if (tree?.type !== 'tree') return undefined
    const entry = tree.entries.find((e) => e.name === name)
    if (!entry) return undefined
    const next = git.objects[entry.oid]
    if (i === parts.length - 1) return next?.type === 'blob' ? next.content : undefined
    tree = next
  }
  return undefined
}

/** コミットに入っているファイルの一覧 */
export function filesAt(git: GitDir, commitOid: string): string[] {
  const out: string[] = []
  const commit = git.objects[commitOid]
  if (commit?.type !== 'commit') return out
  const walk = (treeOid: string, prefix: string) => {
    const tree = git.objects[treeOid]
    if (tree?.type !== 'tree') return
    for (const e of tree.entries) {
      if (e.mode === '40000') walk(e.oid, `${prefix}${e.name}/`)
      else out.push(prefix + e.name)
    }
  }
  walk(commit.tree, '')
  return out.sort()
}

/** あるコミットから、target のコミットまでたどれるか */
export function reaches(git: GitDir, from: string, target: string): boolean {
  const seen = new Set<string>()
  const stack = [from]
  while (stack.length > 0) {
    const oid = stack.pop() as string
    if (oid === target) return true
    if (seen.has(oid)) continue
    seen.add(oid)
    const c = git.objects[oid]
    if (c?.type === 'commit') stack.push(...c.parents)
  }
  return false
}

/** from から first-parent でたどった、target までのコミットの数（たどれなければ null） */
export function distance(git: GitDir, from: string, target: string): number | null {
  let cur: string | undefined = from
  let n = 0
  while (cur) {
    if (cur === target) return n
    const c: GitDir['objects'][string] | undefined = git.objects[cur]
    if (c?.type !== 'commit') return null
    cur = c.parents[0]
    n++
  }
  return null
}

export function messageOf(git: GitDir, oid: string): string {
  const c = git.objects[oid]
  return c?.type === 'commit' ? c.message : ''
}

export const subjectOf = (message: string) => message.split('\n')[0]?.trim() ?? ''

export const isBadMessage = (subject: string) => DEFAULT_BAD_MESSAGES.test(subject)

export { hasConflictMarkers }

/** world の中で、いちばん新しいコミットの時刻（NPC のコミットをその後にするため） */
function latestTime(world: World): number {
  let latest = 0
  for (const ws of Object.values(world.workspaces)) {
    for (const obj of Object.values(ws.git?.objects ?? {})) {
      if (obj.type === 'commit') latest = Math.max(latest, obj.committer.timestamp)
    }
  }
  return latest
}

export interface NpcResult {
  world: World
  /** ターミナルに出す行（「  田中$ git push」） */
  log: string[]
  /** すべて成功したか */
  ok: boolean
}

/**
 * プレイ中に NPC がコマンドを打つ。時刻は world のいちばん新しいコミットの1分後から。
 * 失敗したら、そこで止める（プレイヤーの操作で状況が変わったなど）
 */
export function npc(
  world: World,
  workspace: string,
  actor: string,
  steps: (string | { write: Record<string, string> })[],
): NpcResult {
  let w = world
  let clock = latestTime(world) + 60
  const log: string[] = []
  for (const step of steps) {
    if (typeof step !== 'string') {
      for (const [path, content] of Object.entries(step.write))
        w = writeFile(w, workspace, path, content)
      continue
    }
    const r = execute(w, step, {
      workspace,
      now: { timestamp: clock, tzOffset: 540 },
      tty: false,
    })
    clock += 1
    log.push(`  ${actor}$ ${step}`)
    if (r.exitCode !== 0) {
      log.push(`  （${actor} の「${step}」は失敗しました）`)
      return { world: w, log, ok: false }
    }
    w = r.world
  }
  return { world: w, log, ok: true }
}

/** よく使う補助チップ。状態から、次に打ちそうなものを出す（--force は出さない） */
export function basicChips(world: World, workspace: string): Chip[] {
  const git = repo(world, workspace)
  if (!git) return [{ command: 'ls' }]
  const files = worktree(world, workspace)
  const changed = Object.keys(files).filter((p) => {
    const i = own(git.index, p)
    return (
      !i ||
      git.objects[i.oid]?.type !== 'blob' ||
      (git.objects[i.oid] as { content: string }).content !== files[p]
    )
  })
  const chips: Chip[] = [{ command: 'git status' }]
  if (changed.length > 0) chips.push({ command: `git add ${changed[0]}` })
  chips.push({ command: 'git commit -m ""', cursorBack: 1 }, { command: 'git push' })
  chips.push({ command: 'git log --oneline' })
  return chips
}

/** コンフリクトの印があるか（ファイルの中身） */
export const marked = (content: string | undefined) =>
  content !== undefined && hasConflictMarkers(content)
