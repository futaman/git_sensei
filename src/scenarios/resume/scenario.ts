// ステージ 2-5「職務経歴書」（docs/07）
// 教えること：git rm --cached（コミットからは外し、ファイルは残す）と、--cached なしの rm の違い。
// 解答手順（par 3）：git rm -r --cached 転職 → git commit --amend --no-edit → git push
// --cached を忘れて消したら：amend の前なら restore --source HEAD、reset --soft の後なら restore --source ORIG_HEAD
import type { ExecuteResult, GitDir, World } from '../../engine/index.ts'
import {
  fileAt,
  fileOf,
  filesAt,
  HOME,
  origHeadOf,
  PLAYER,
  repo,
  tipOf,
  WorldBuilder,
} from '../kit.ts'
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
import { FILES, GOALS, INTRO, LINES, MISSION, NAMES, RESUME, SITUATION } from './lines.ja.ts'

const ORIGIN = '/git.example.com/billing.git'
const ME = `${HOME}/billing`
const SENPAI = '/home/hayase/billing'
/** 部長の pull が終わるまでの作中の秒 */
const PULL_SEC = 8 * 60

function buildWorld(now: Parameters<StageDefinition['buildWorld']>[0]) {
  return new WorldBuilder(now, [HOME])
    .server(ORIGIN)
    .at(60 * 24 * 7)
    .founder(SENPAI, 'hayase', ORIGIN, FILES.base, 'init')
    .at(60 * 24)
    .run(HOME, 'git clone https://git.example.com/billing.git')
    .at(10)
    .commit(ME, { ...FILES.pdf, ...FILES.resume }, 'feat: 請求書を PDF で出力する')
    .build()
}

const originTip = (world: World) => tipOf(repo(world, ORIGIN), 'main')
const originHas = (world: World, path: string) => {
  const origin = repo(world, ORIGIN)
  const tip = originTip(world)
  return !!origin && !!tip && fileAt(origin, tip, path) !== undefined
}
const originHasResume = (world: World) => {
  const origin = repo(world, ORIGIN)
  const tip = originTip(world)
  return !!origin && !!tip && filesAt(origin, tip).some((p) => p.startsWith('転職/'))
}
const keepsResume = (world: World) => fileOf(world, ME, RESUME) !== undefined
const commitHasResume = (git: GitDir | null, oid: string | null) =>
  !!git && !!oid && fileAt(git, oid, RESUME) !== undefined

function evaluate(
  before: World,
  result: ExecuteResult,
  command: string,
  progress: StageProgress,
  _ctx: StageContext,
): StageEvaluation {
  const evaluation = nothing()
  const flag = (f: string) => {
    if (!progress.flags.includes(f)) progress.flags.push(f)
  }
  const world = result.world
  if (/^\s*git\s+show\b/.test(command)) flag('looked')
  if (/職務経歴書/.test(result.stdout)) {
    evaluation.notes.push({ from: 'kouhai', key: 'kouhai.saw' })
    flag('seen')
  }
  if (/--amend/.test(command) && result.exitCode === 0) flag('amended')
  if (/^\s*git\s+rm\b.*--cached/.test(command) && result.exitCode === 0) {
    evaluation.notes.push({ from: 'kouhai', key: 'kouhai.smart', trust: 5 })
  }
  // 手元の職務経歴書が消えた／戻った
  if (fileOf(before, ME, RESUME) !== undefined && !keepsResume(world)) {
    evaluation.notes.push({ from: 'kouhai', key: 'kouhai.deletedFile' })
    flag('deleted')
  }
  if (
    fileOf(before, ME, RESUME) === undefined &&
    keepsResume(world) &&
    progress.flags.includes('deleted')
  ) {
    evaluation.milestones.push('restored')
    flag('restored')
  }
  if (result.events.some((e) => e.type === 'PUSHED') && originHasResume(world)) flag('leaked')

  evaluation.cleared = done(world)
  if (evaluation.cleared) evaluation.ending = ending(world, progress)
  return evaluation
}

const done = (world: World) =>
  originHas(world, 'src/invoice/pdf.ts') && !originHasResume(world) && keepsResume(world)

function ending(world: World, progress: StageProgress): StageEvaluation['ending'] {
  const script: NonNullable<StageEvaluation['ending']>['script'] = []
  if (progress.flags.includes('leaked') || originHasResume(world)) {
    script.push({ from: 'boss', key: 'ending.leaked' })
  } else if (!originHas(world, 'src/invoice/pdf.ts')) {
    script.push({ from: 'boss', key: 'ending.timeout' })
  } else {
    script.push({ from: 'boss', key: 'ending.clean' })
  }
  if (progress.flags.includes('restored')) script.push({ from: 'senpai', key: 'ending.restored' })
  if (!keepsResume(world) && progress.flags.includes('amended')) {
    script.push({ from: 'system', key: 'ending.hidden' })
  }
  if (progress.flags.includes('seen')) script.push({ from: 'kouhai', key: 'kouhai.saw' })
  return { script, ...(progress.flags.includes('leaked') ? { maxRank: 'C' as const } : {}) }
}

/** 部長の pull が終わった：そのときの origin で結末が決まる */
function onTime(id: string, world: World, progress: StageProgress): StageEvaluation {
  const evaluation = nothing()
  if (id === 'pulling') evaluation.notes.push({ from: 'boss', key: 'boss.pulling' })
  if (id === 'pullDone') {
    evaluation.end = true
    evaluation.ending = ending(world, progress)
  }
  return evaluation
}

function status(_w: World, _p: StageProgress, gameSec: number): StageStatus[] {
  const minutes = Math.min(8, Math.floor(gameSec / 60))
  return [
    {
      label: '部長の pull',
      value: `${'■'.repeat(minutes)}${'□'.repeat(8 - minutes)}`,
      tone: minutes >= 6 ? 'danger' : minutes >= 4 ? 'warn' : 'normal',
    },
  ]
}

function hint(world: World, progress: StageProgress): string {
  const git = repo(world, ME)
  const head = tipOf(git, 'main')
  if (!keepsResume(world)) {
    if (commitHasResume(git, head)) return 'hint.restoreFile'
    if (git && commitHasResume(git, origHeadOf(git))) return 'hint.restoreFromOrigHead'
    return 'hint.lostAfterAmend'
  }
  const indexHasResume = !!git && Object.keys(git.index).some((p) => p.startsWith('転職/'))
  if (commitHasResume(git, head)) {
    if (indexHasResume) return progress.flags.includes('looked') ? 'hint.rmCached' : 'hint.look'
    return 'hint.amend'
  }
  return 'hint.push'
}

function chips(): Chip[] {
  return [
    { command: 'git show --stat' },
    { command: 'git status' },
    { command: 'git rm -r --cached 転職' },
    { command: 'git commit --amend --no-edit' },
    { command: 'git push' },
  ]
}

function goals(world: World): StageGoal[] {
  return [
    { text: GOALS.pdf, done: originHas(world, 'src/invoice/pdf.ts') },
    { text: GOALS.noResume, done: !originHasResume(world) },
    { text: GOALS.keep, done: keepsResume(world) },
  ]
}

export const RESUME_STAGE: StageDefinition = {
  id: 'resume',
  number: '2-5',
  title: '職務経歴書',
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
    // 部長の pull が終わる作中8分を、実時間4分で
    deadlineSec: PULL_SEC / 2,
    clockStart: '16:00',
    clockScale: 2,
    idleHelper: true,
    seed: 1600,
    lines: LINES,
  },
  policy: { player: PLAYER.name },
  checkpointOnFatal: false,
  evaluate,
  chips,
  goals,
  hint,
  hintSec: 60,
  timeline: [
    { id: 'pulling', atSec: 60 },
    { id: 'pullDone', atSec: PULL_SEC },
  ],
  onTime,
  status,
  reports: {},
  names: NAMES,
}
