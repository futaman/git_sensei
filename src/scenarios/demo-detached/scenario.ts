// ステージ 2-1「デモ5分前」（docs/07）
// 教えること：detached HEAD。出力（status の1行目、switch の Warning）を読めば救える。
// 解答手順（par 4）：git switch -c demo-fix → git switch demo → git merge demo-fix → git push
// 迷子の罠：いきなり git switch demo すると、修正がどのブランチからもたどれなくなる。
//           Warning に出たハッシュで git branch rescue <hash> → merge → push で救える
import type { ExecuteResult, GitDir, World } from '../../engine/index.ts'
import { fileAt, HOME, PLAYER, reaches, repo, subjectOf, tipOf, WorldBuilder } from '../kit.ts'
import {
  type Chip,
  nothing,
  type StageContext,
  type StageDefinition,
  type StageEvaluation,
  type StageGoal,
  type StageProgress,
  type StageStatus,
} from '../stage.ts'
import {
  FILES,
  FIX_MESSAGE,
  FIXED_LABEL,
  GOALS,
  INTRO,
  LINES,
  MISSION,
  NAMES,
  REPORTS,
  SITUATION,
} from './lines.ja.ts'

const ORIGIN = '/git.example.com/shop-app.git'
const ME = `${HOME}/shop-app`
const SENPAI = '/home/hayase/shop-app'

function buildWorld(now: Parameters<StageDefinition['buildWorld']>[0]) {
  return new WorldBuilder(now, [HOME])
    .server(ORIGIN)
    .at(60 * 24 * 14)
    .founder(SENPAI, 'hayase', ORIGIN, FILES.base, 'feat: v1.2')
    .run(SENPAI, 'git branch demo', 'git push origin demo')
    .at(60 * 24 * 5)
    .commit(SENPAI, FILES.later1, 'feat: v1.3 のトップページ')
    .at(60 * 24 * 2)
    .commit(SENPAI, FILES.later2, 'feat: キャンペーンページ')
    .run(SENPAI, 'git push')
    .at(60 * 18)
    .run(HOME, 'git clone https://git.example.com/shop-app.git')
    .run(ME, 'git switch demo', 'git switch --detach demo')
    .at(60 * 15)
    .commit(ME, FILES.fixed, FIX_MESSAGE)
    .build()
}

/** 昨夜の修正のコミット（迷子になっても、オブジェクトは残っている） */
function fixOid(git: GitDir | null): string | null {
  if (!git) return null
  for (const [oid, obj] of Object.entries(git.objects)) {
    if (obj.type === 'commit' && subjectOf(obj.message) === FIX_MESSAGE) return oid
  }
  return null
}

const hasFix = (git: GitDir | null, commit: string | null) =>
  !!git &&
  !!commit &&
  fileAt(git, commit, 'src/components/BuyButton.tsx')?.includes(FIXED_LABEL) === true

/** ブランチのどれかから、修正のコミットまでたどれるか */
function onSomeBranch(git: GitDir | null): string | null {
  const fix = fixOid(git)
  if (!git || !fix) return null
  for (const ref of Object.keys(git.refs).sort()) {
    if (ref.startsWith('refs/heads/') && reaches(git, git.refs[ref] as string, fix)) {
      return ref.slice('refs/heads/'.length)
    }
  }
  return null
}

const originDone = (world: World) => {
  const origin = repo(world, ORIGIN)
  return hasFix(origin, tipOf(origin, 'demo'))
}

function evaluate(
  before: World,
  result: ExecuteResult,
  _command: string,
  progress: StageProgress,
  ctx: StageContext,
): StageEvaluation {
  const evaluation = nothing()
  const flag = (f: string) => {
    if (!progress.flags.includes(f)) progress.flags.push(f)
  }
  if (ctx.dangers.some((d) => d.kind === 'COMMITS_ORPHANED')) {
    flag('orphaned')
    evaluation.notes.push(
      { from: 'kouhai', key: 'kouhai.orphaned' },
      { from: 'senpai', key: 'senpai.afterOrphan' },
    )
  }
  const git = repo(result.world, ME)
  const wasOnBranch = onSomeBranch(repo(before, ME))
  const nowOnBranch = onSomeBranch(git)
  if (!wasOnBranch && nowOnBranch) {
    evaluation.milestones.push(progress.flags.includes('orphaned') ? 'rescued' : 'onBranch')
    if (progress.flags.includes('orphaned')) flag('rescued')
  }

  evaluation.cleared = originDone(result.world)
  if (evaluation.cleared) {
    const script: NonNullable<StageEvaluation['ending']>['script'] = []
    if (ctx.late) {
      script.push(
        { from: 'boss', key: 'ending.late' },
        { from: 'kouhai', key: 'ending.lateKouhai' },
      )
    } else if (progress.flags.includes('orphaned')) {
      script.push({ from: 'senpai', key: 'ending.rescued' }, { from: 'boss', key: 'ending.onTime' })
    } else {
      script.push({ from: 'system', key: 'ending.client' }, { from: 'boss', key: 'ending.onTime' })
    }
    evaluation.ending = { script }
  }
  return evaluation
}

/** 待機室の人数：最初は1人、作中1分ごとに1人ずつ増える */
const waiting = (gameSec: number) => 1 + Math.floor(gameSec / 60)

function onTime(id: string): StageEvaluation {
  const evaluation = nothing()
  const n = Number(id.replace('wait.', ''))
  if (n === 3 || n === 5) {
    evaluation.notes.push({
      from: 'kouhai',
      key: 'kouhai.waiting',
      vars: { n: String(n) },
      id: `kouhai.waiting.${n}`,
    })
  }
  return evaluation
}

function status(_world: World, _progress: StageProgress, gameSec: number): StageStatus[] {
  const n = waiting(gameSec)
  return [{ label: '待機室', value: `${n}人`, tone: n >= 4 ? 'warn' : 'normal' }]
}

function hint(world: World, progress: StageProgress): string {
  const git = repo(world, ME)
  if (!git) return 'hint.status'
  const branch = onSomeBranch(git)
  if (!branch) {
    if (progress.flags.includes('orphaned')) return 'hint.rescue'
    return progress.flags.includes('sawStatus') ? 'hint.branch' : 'hint.status'
  }
  const demo = tipOf(git, 'demo')
  const fix = fixOid(git)
  const onDemo = git.head.type === 'symbolic' && git.head.ref === 'refs/heads/demo'
  if (demo && fix && reaches(git, demo, fix)) return 'hint.push'
  return onDemo ? 'hint.merge' : 'hint.toDemo'
}

function chips(world: World): Chip[] {
  const git = repo(world, ME)
  if (!git) return []
  if (git.head.type === 'detached') {
    return [
      { command: 'git status' },
      { command: 'git log --oneline --all' },
      { command: 'git switch -c demo-fix' },
    ]
  }
  const branch = git.head.ref.replace('refs/heads/', '')
  const list: Chip[] = [{ command: 'git status' }, { command: 'git log --oneline --all' }]
  if (branch !== 'demo') list.push({ command: 'git switch demo' })
  else list.push({ command: 'git merge ' }, { command: 'git push' })
  return list
}

function goals(world: World): StageGoal[] {
  return [{ text: GOALS.demo, done: originDone(world) }]
}

export const DEMO_DETACHED: StageDefinition = {
  id: 'demo-detached',
  number: '2-1',
  title: 'デモ5分前',
  mission: MISSION,
  situation: SITUATION,
  intro: INTRO,
  home: HOME,
  workspace: ME,
  buildWorld,
  drama: {
    mode: 'practice',
    cast: ['kouhai', 'boss', 'senpai'],
    par: 4,
    deadlineSec: 300,
    clockStart: '14:55',
    clockScale: 1,
    idleHelper: true,
    seed: 1455,
    lines: LINES,
  },
  policy: { player: PLAYER.name },
  checkpointOnFatal: false,
  evaluate: (before, result, command, progress, ctx) => {
    if (/^\s*git\s+status\b/.test(command) && !progress.flags.includes('sawStatus')) {
      progress.flags.push('sawStatus')
    }
    return evaluate(before, result, command, progress, ctx)
  },
  chips,
  goals,
  hint,
  hintSec: 60,
  // デモまで5分しかないので、ふつうのコマンドは20秒、エラーは40秒
  durationOf: (command, result) => {
    if (/^\s*(git\s+(status|log|diff|show)|ls|cat|pwd|cd)\b/.test(command)) return 0
    return result.exitCode === 0 ? 20 : 40
  },
  timeline: [1, 2, 3, 4, 5].map((n) => ({ id: `wait.${n + 1}`, atSec: n * 60 })),
  onTime,
  status,
  reports: REPORTS,
  names: NAMES,
}
