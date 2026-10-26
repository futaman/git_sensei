// ステージ 2-2「先輩の force push」（docs/07）
// 教えること：fetch しないと origin の今は分からない。--force-with-lease は「知らない変更」だけを守る。
// 解答手順（par 3）：git fetch →（git log origin/feature/coupon で確かめる）→ git pull --no-rebase → git push → 報告
import type { ExecuteResult, World } from '../../engine/index.ts'
import { fileAt, HOME, PLAYER, repo, tipOf, WorldBuilder } from '../kit.ts'
import {
  type Chip,
  nothing,
  type StageContext,
  type StageDefinition,
  type StageEvaluation,
  type StageGoal,
  type StageProgress,
} from '../stage.ts'
import {
  CHOICES,
  FILES,
  GOALS,
  INTRO,
  LINES,
  MISSION,
  MY_MESSAGE,
  NAMES,
  REPORTS,
  SENPAI_MESSAGE,
  SITUATION,
} from './lines.ja.ts'

const ORIGIN = '/git.example.com/shop-app.git'
const ME = `${HOME}/shop-app`
const SENPAI = '/home/hayase/shop-app'
const BRANCH = 'feature/coupon'

function buildWorld(now: Parameters<StageDefinition['buildWorld']>[0]) {
  return (
    new WorldBuilder(now, [HOME])
      .server(ORIGIN)
      .at(60 * 24 * 10)
      .founder(SENPAI, 'hayase', ORIGIN, FILES.base, 'feat: クーポンの土台')
      .at(60 * 24 * 3)
      .run(SENPAI, `git switch -c ${BRANCH}`)
      .commit(SENPAI, FILES.b, 'docs: クーポンの説明')
      .run(SENPAI, `git push -u origin ${BRANCH}`)
      .at(60 * 24 * 2)
      .run(HOME, 'git clone https://git.example.com/shop-app.git')
      .run(ME, 'git config pull.rebase false', `git switch ${BRANCH}`)
      .at(60 * 20)
      .commit(ME, FILES.x, MY_MESSAGE)
      .run(ME, 'git push')
      // 今朝：早瀬先輩は fetch せずに自分のコミットを作り、弾かれたので --force で押し切った
      .at(60 * 3)
      .commit(SENPAI, FILES.c, SENPAI_MESSAGE)
      .run(SENPAI, 'git push --force')
      .build()
  )
}

const originTip = (world: World) => tipOf(repo(world, ORIGIN), BRANCH)
const hasMine = (world: World) => {
  const origin = repo(world, ORIGIN)
  const tip = originTip(world)
  return (
    !!origin &&
    !!tip &&
    fileAt(origin, tip, 'src/coupon/expire.ts') === FILES.x['src/coupon/expire.ts']
  )
}
const hasSenpai = (world: World) => {
  const origin = repo(world, ORIGIN)
  const tip = originTip(world)
  return !!origin && !!tip && fileAt(origin, tip, 'src/coupon/ui.ts') !== undefined
}
const reported = (progress: StageProgress) => progress.choices.find((c) => c.startsWith('report.'))

function finishIfDone(world: World, progress: StageProgress, evaluation: StageEvaluation): void {
  const report = reported(progress)
  evaluation.cleared = hasMine(world) && hasSenpai(world) && report !== undefined
  if (!evaluation.cleared) return
  const script: NonNullable<StageEvaluation['ending']>['script'] =
    {
      'report.fixedAndAdvise': [
        { from: 'senpai' as const, key: 'ending.A.senpai' },
        { from: 'kouhai' as const, key: 'ending.A.kouhai' },
      ],
      'report.fact': [
        { from: 'senpai' as const, key: 'ending.B.senpai' },
        { from: 'senpai' as const, key: 'ending.B.senpai2' },
      ],
      'report.silent': [{ from: 'system' as const, key: 'ending.C' }],
      'report.boss': [
        { from: 'boss' as const, key: 'ending.D.boss' },
        { from: 'senpai' as const, key: 'ending.D.senpai' },
      ],
    }[report as string] ?? []
  evaluation.ending = { script, ...(report === 'report.silent' ? { maxRank: 'B' as const } : {}) }
}

function evaluate(
  _before: World,
  result: ExecuteResult,
  command: string,
  progress: StageProgress,
  ctx: StageContext,
): StageEvaluation {
  const evaluation = nothing()
  const flag = (f: string) => {
    if (!progress.flags.includes(f)) progress.flags.push(f)
  }
  if (/^\s*git\s+status\b/.test(command) && !progress.flags.includes('fetched')) {
    evaluation.notes.push({ from: 'kouhai', key: 'kouhai.upToDate' })
  }
  for (const e of result.events) {
    if (e.type === 'FETCHED' && e.updates.length > 0) {
      flag('fetched')
      if (!progress.milestones.includes('fetched')) evaluation.milestones.push('fetched')
    }
    if (e.type === 'PUSH_REJECTED' && e.reason === 'stale-info') {
      evaluation.notes.push({ from: 'senpai', key: 'senpai.leaseStopped' })
    }
    if (e.type === 'MERGED' || (e.type === 'COMMIT_CREATED' && e.parents.length > 1)) {
      evaluation.notes.push({ from: 'kouhai', key: 'kouhai.askMerge' })
      flag('askedMerge')
    }
  }
  // pull の中の fetch でも、origin の今を知ったことになる
  if (/^\s*git\s+pull\b/.test(command)) flag('fetched')
  if (/^\s*git\s+log\b/.test(command) && progress.flags.includes('askedMerge')) {
    evaluation.notes.push({ from: 'kouhai', key: 'kouhai.observeBeforeDanger', trust: 3 })
  }
  if (ctx.dangers.some((d) => d.kind === 'FORCE_PUSH_OVERWROTE')) {
    evaluation.notes.push({ from: 'senpai', key: 'senpai.overwritten' })
    if (command.includes('--force-with-lease')) {
      evaluation.notes.push({ from: 'senpai', key: 'hint.lease' })
    }
  }
  finishIfDone(result.world, progress, evaluation)
  return evaluation
}

function onChoice(_id: string, world: World, progress: StageProgress): StageEvaluation {
  const evaluation = nothing()
  finishIfDone(world, progress, evaluation)
  return evaluation
}

function hint(world: World, progress: StageProgress): string {
  if (!progress.flags.includes('fetched')) return 'hint.fetch'
  const git = repo(world, ME)
  const local = tipOf(git, BRANCH)
  const localHasSenpai = !!git && !!local && fileAt(git, local, 'src/coupon/ui.ts') !== undefined
  if (!localHasSenpai)
    return progress.flags.includes('comparedOrigin') ? 'hint.pull' : 'hint.compare'
  if (!hasMine(world) || !hasSenpai(world)) return 'hint.push'
  return 'hint.report'
}

function chips(world: World, progress: StageProgress): Chip[] {
  const list: Chip[] = [{ command: 'git status' }, { command: 'git fetch' }]
  if (progress.flags.includes('fetched')) {
    list.push(
      { command: `git log --oneline origin/${BRANCH}` },
      { command: 'git pull --no-rebase' },
    )
  }
  list.push({ command: 'git push' })
  void world
  return list
}

function goals(world: World, progress: StageProgress): StageGoal[] {
  return [
    { text: GOALS.mine, done: hasMine(world) },
    { text: GOALS.senpai, done: hasSenpai(world) },
    { text: GOALS.report, done: reported(progress) !== undefined },
  ]
}

export const SENPAI_FORCE: StageDefinition = {
  id: 'senpai-force',
  number: '2-2',
  title: '先輩の force push',
  mission: MISSION,
  situation: SITUATION,
  intro: INTRO,
  home: HOME,
  workspace: ME,
  buildWorld,
  drama: {
    mode: 'practice',
    cast: ['kouhai', 'boss', 'senpai'],
    par: 3,
    // 作中10分（11:50 → 12:00）を、実時間5分で
    deadlineSec: 300,
    clockStart: '11:50',
    clockScale: 2,
    idleHelper: true,
    seed: 1150,
    lines: LINES,
  },
  policy: { player: PLAYER.name },
  checkpointOnFatal: true,
  evaluate: (before, result, command, progress, ctx) => {
    if (/^\s*git\s+log\b.*origin\//.test(command) && !progress.flags.includes('comparedOrigin')) {
      progress.flags.push('comparedOrigin')
    }
    return evaluate(before, result, command, progress, ctx)
  },
  chips,
  goals,
  hint,
  hintSec: 120,
  choices: CHOICES.map((c) => ({
    ...c,
    available: (_w: World, p: StageProgress) => reported(p) === undefined,
  })),
  onChoice,
  reports: REPORTS,
  names: NAMES,
}
