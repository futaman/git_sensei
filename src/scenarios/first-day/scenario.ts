// ステージ 1-1「入社初日、犯人は log の中」（docs/07）
// 教えること：clone と log。出力（作者と日時）を読めば解ける謎。見るコマンドはタダ。
// 解答手順（par 1。cd と log は見るだけなので数えない）：git clone → cd shop-app →（git log を読む）→ #dev で「とりあえず」を選ぶ
import type { ExecuteResult, World } from '../../engine/index.ts'
import { HOME, PLAYER, repo, WorldBuilder } from '../kit.ts'
import {
  type Chip,
  nothing,
  type StageDefinition,
  type StageEvaluation,
  type StageGoal,
  type StageProgress,
} from '../stage.ts'
import { CHOICES, FILES, GOALS, INTRO, LINES, MISSION, NAMES, SITUATION } from './lines.ja.ts'

const ORIGIN = '/git.example.com/shop-app.git'
const ME = `${HOME}/shop-app`
const TEAM = '/home/team/shop-app'

function buildWorld(now: Parameters<StageDefinition['buildWorld']>[0]) {
  return new WorldBuilder(now, [HOME])
    .server(ORIGIN)
    .at(60 * 24 * 21)
    .founder(TEAM, 'hayase', ORIGIN, FILES.init, 'init')
    .at(60 * 24 * 3)
    .commit(TEAM, FILES.cart, 'feat: カートに合計金額を表示')
    .atClock('15:20', -1)
    .as(TEAM, 'tanaka')
    .commit(TEAM, FILES.calc, '料金改定：手数料率を3.6%に')
    .atClock('23:41', -1)
    .as(TEAM, 'kuroiwa')
    .commit(TEAM, FILES.broken, 'とりあえず')
    .atClock('09:02')
    .as(TEAM, 'hayase')
    .commit(TEAM, FILES.readme, 'docs: README を更新')
    .run(TEAM, 'git push')
    .build()
}

const cloned = (world: World) => !!repo(world, ME)

function evaluate(
  _before: World,
  result: ExecuteResult,
  command: string,
  progress: StageProgress,
): StageEvaluation {
  const evaluation = nothing()
  if (result.events.some((e) => e.type === 'CLONED')) evaluation.milestones.push('cloned')
  const inRepo =
    result.cwd === ME || (result.cwd === undefined && progress.flags.includes('inRepo'))
  if (result.cwd === ME) progress.flags.push('inRepo')
  if (result.cwd !== undefined && result.cwd !== ME) {
    progress.flags = progress.flags.filter((f) => f !== 'inRepo')
  }
  if (inRepo && /^\s*git\s+log\b/.test(command) && result.exitCode === 0) {
    if (!progress.milestones.includes('sawLog')) evaluation.milestones.push('sawLog')
    if (command.includes('--oneline'))
      evaluation.notes.push({ from: 'kouhai', key: 'kouhai.oneline' })
  }
  return evaluation
}

function onChoice(id: string): StageEvaluation {
  const evaluation = nothing()
  switch (id) {
    case 'answer.d4':
      evaluation.cleared = true
      evaluation.ending = {
        script: [
          { from: 'boss', key: 'ending.bossConfess' },
          { from: 'kouhai', key: 'ending.kouhaiWhisper' },
          { from: 'senpai', key: 'ending.welcome' },
        ],
      }
      break
    case 'answer.c3':
      evaluation.notes.push(
        { from: 'kouhai', key: 'answer.wrong.kouhai', repeat: true },
        { from: 'boss', key: 'answer.wrong.kouhai.boss', repeat: true },
      )
      break
    case 'answer.e5':
      evaluation.notes.push({ from: 'senpai', key: 'answer.wrong.senpai', repeat: true })
      break
    case 'answer.b2':
      evaluation.notes.push({ from: 'senpai', key: 'answer.wrong.old', repeat: true })
      break
    case 'answer.unknown':
      evaluation.notes.push(
        { from: 'boss', key: 'answer.dontKnow', repeat: true },
        { from: 'senpai', key: 'answer.dontKnow.senpai', repeat: true },
      )
      break
  }
  return evaluation
}

function hint(world: World, progress: StageProgress): string {
  if (!cloned(world)) return 'hint.clone'
  if (!progress.flags.includes('inRepo')) return 'hint.cd'
  if (!progress.milestones.includes('sawLog')) return 'hint.log'
  return 'hint.answer'
}

function chips(world: World, progress: StageProgress): Chip[] {
  if (!cloned(world)) return [{ command: 'git clone ' }, { command: 'ls' }]
  if (!progress.flags.includes('inRepo')) return [{ command: 'ls' }, { command: 'cd shop-app' }]
  return [{ command: 'git log' }, { command: 'git log --oneline' }, { command: 'git status' }]
}

function goals(world: World, progress: StageProgress): StageGoal[] {
  return [
    { text: GOALS.clone, done: cloned(world) && progress.flags.includes('inRepo') },
    { text: GOALS.answer, done: progress.choices.includes('answer.d4') },
  ]
}

export const FIRST_DAY: StageDefinition = {
  id: 'first-day',
  number: '1-1',
  title: '入社初日、犯人は log の中',
  mission: MISSION,
  situation: SITUATION,
  terminalIntro: 'まずは git clone で、チームのリポジトリを手元に持ってきましょう。',
  intro: INTRO,
  home: HOME,
  workspace: HOME,
  buildWorld,
  drama: {
    mode: 'experience',
    cast: ['kouhai', 'boss', 'senpai'],
    par: 1,
    // 作中60分（9:30 → 10:30）を、実時間5分で
    deadlineSec: 300,
    clockStart: '09:30',
    clockScale: 12,
    idleHelper: true,
    seed: 930,
    lines: LINES,
  },
  policy: { player: PLAYER.name },
  checkpointOnFatal: false,
  evaluate,
  chips,
  goals,
  hint,
  choices: CHOICES.map((c) => ({
    ...c,
    available: (_w: World, p: StageProgress) => p.milestones.includes('sawLog'),
    repeatable: c.id !== 'answer.d4',
  })),
  onChoice,
  reports: {},
  names: NAMES,
}
