// ステージ 2-4「本日26時リリース」（docs/07。もとは docs/04_spec_scenarios の 2章）
// 教えること：git rm --cached と commit --amend で、コミットを作り直す。reset --hard の後は ORIG_HEAD で戻れる。
// 解答手順（par 3）：git rm -r --cached node_modules debug.log src/payment/calc.ts.bak memo.txt
//                  → git commit --amend -m "fix: …" → git push
// ほかの正しいルート：git reset HEAD~1 → git add src/payment/calc.ts → git commit → git push
import type { ExecuteResult, GitDir, World } from '../../engine/index.ts'
import {
  distance,
  fileAt,
  fileOf,
  filesAt,
  HOME,
  isBadMessage,
  messageOf,
  origHeadOf,
  PLAYER,
  repo,
  subjectOf,
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
} from '../stage.ts'
import {
  CALC,
  FILES,
  GOALS,
  INTRO,
  LINES,
  MISSION,
  NAMES,
  SITUATION,
  SLEEPY_MESSAGE,
} from './lines.ja.ts'

const ORIGIN = '/git.example.com/payment.git'
const ME = `${HOME}/payment`
const SENPAI = '/home/hayase/payment'
const FIXED = FILES.fix[CALC]

function buildWorld(now: Parameters<StageDefinition['buildWorld']>[0]) {
  return new WorldBuilder(now, [HOME])
    .server(ORIGIN)
    .at(60 * 24 * 5)
    .founder(SENPAI, 'hayase', ORIGIN, FILES.base, 'init')
    .at(60 * 6)
    .run(HOME, 'git clone https://git.example.com/payment.git')
    .at(5)
    .commit(ME, { ...FILES.fix, ...FILES.junk, ...FILES.memo }, SLEEPY_MESSAGE)
    .build()
}

const initialTip = (world: World) => tipOf(repo(world, SENPAI), 'main')
const isJunk = (path: string) =>
  path.startsWith('node_modules/') || path === 'debug.log' || path.endsWith('.bak')

/** コミットに入っている、開始時の main から変わったファイル */
function changedFiles(git: GitDir, commit: string, base: GitDir, baseTip: string): string[] {
  const all = new Set([...filesAt(git, commit), ...filesAt(base, baseTip)])
  return [...all].filter((p) => fileAt(git, commit, p) !== fileAt(base, baseTip, p)).sort()
}

const goodMessage = (subject: string) =>
  subject !== '' && subject !== SLEEPY_MESSAGE && !isBadMessage(subject)

/** origin の main の様子 */
function originState(world: World) {
  const origin = repo(world, ORIGIN)
  const senpai = repo(world, SENPAI)
  const tip = tipOf(origin, 'main')
  const base = initialTip(world)
  if (!origin || !senpai || !tip || !base) {
    return { fix: false, clean: false, one: false, junk: false, memo: false }
  }
  const changed = changedFiles(origin, tip, senpai, base)
  const count = distance(origin, tip, base)
  return {
    fix: fileAt(origin, tip, CALC) === FIXED,
    clean: changed.every((p) => p === CALC || p === 'memo.txt'),
    one: count === 1 && goodMessage(subjectOf(messageOf(origin, tip))),
    junk: changed.some(isJunk),
    memo: changed.includes('memo.txt'),
  }
}

function evaluate(
  before: World,
  result: ExecuteResult,
  command: string,
  progress: StageProgress,
  ctx: StageContext,
): StageEvaluation {
  const evaluation = nothing()
  const flag = (f: string) => {
    if (!progress.flags.includes(f)) progress.flags.push(f)
  }
  const world = result.world
  if (/^\s*git\s+show\b/.test(command)) flag('looked')
  if (/^\s*git\s+rm\b.*--cached/.test(command) && result.exitCode === 0) {
    evaluation.notes.push({ from: 'kouhai', key: 'kouhai.smart', trust: 5 })
  }
  // reset --hard で calc.ts の修正まで消えた／ORIG_HEAD で戻した
  const hadFix = fileOf(before, ME, CALC) === FIXED
  const hasFix = fileOf(world, ME, CALC) === FIXED
  if (hadFix && !hasFix && /reset\s+--hard/.test(command)) {
    evaluation.notes.push({ from: 'kouhai', key: 'kouhai.discarded' })
    flag('discarded')
  }
  if (!hadFix && hasFix && progress.flags.includes('discarded')) flag('rescued')

  const state = originState(world)
  if (result.events.some((e) => e.type === 'PUSHED') && state.junk) {
    // ゴミごと送った：送るのに作中18分かかる（durationOf）。翌朝、部長に見られる
    evaluation.notes.push(
      { from: 'kouhai', key: 'kouhai.slowPush' },
      { from: 'kouhai', key: 'kouhai.slowPush2' },
      { from: 'boss', key: 'boss.danger.JUNK_STAGED' },
    )
    if (
      subjectOf(
        messageOf(repo(world, ORIGIN) as GitDir, tipOf(repo(world, ORIGIN), 'main') as string),
      ) === SLEEPY_MESSAGE
    ) {
      evaluation.notes.push({ from: 'boss', key: 'boss.danger.BAD_COMMIT_MESSAGE' })
    }
    evaluation.end = true
    evaluation.ending = { script: [{ from: 'system', key: 'ending.junk' }] }
    return evaluation
  }

  evaluation.cleared = state.fix && state.clean && state.one
  if (evaluation.cleared) {
    const script: NonNullable<StageEvaluation['ending']>['script'] = []
    if (ctx.late) {
      script.push({ from: 'boss', key: 'ending.late' })
    } else {
      if (ctx.gameSec > 15 * 60) script.push({ from: 'kouhai', key: 'ending.close.kouhai' })
      script.push({ from: 'system', key: 'ending.morning' }, { from: 'boss', key: 'ending.early' })
    }
    if (progress.flags.includes('rescued')) {
      script.push(
        { from: 'kouhai', key: 'ending.rescued.kouhai' },
        { from: 'senpai', key: 'ending.rescued.senpai' },
      )
    }
    if (state.memo) script.push({ from: 'boss', key: 'ending.memo' })
    evaluation.ending = { script }
  }
  return evaluation
}

function onTime(id: string): StageEvaluation {
  const evaluation = nothing()
  if (id === 'wake') evaluation.notes.push({ from: 'kouhai', key: 'kouhai.wake' })
  return evaluation
}

/** 手元のコミット（HEAD）と index の様子 */
function local(world: World) {
  const git = repo(world, ME)
  const head = tipOf(git, 'main')
  const senpai = repo(world, SENPAI)
  const base = initialTip(world)
  const committed = git && head && senpai && base ? changedFiles(git, head, senpai, base) : []
  const indexJunk = !!git && Object.keys(git.index).some(isJunk)
  return { git, head, base, committed, indexJunk }
}

function hint(world: World, progress: StageProgress): string {
  const l = local(world)
  if (fileOf(world, ME, CALC) !== FIXED && l.git && origHeadOf(l.git)) return 'hint.rescue'
  if (!l.git || !l.head) return 'hint.look'
  if (l.head === l.base) return 'hint.addCalc'
  if (l.committed.some(isJunk)) {
    if (!progress.flags.includes('looked')) return 'hint.look'
    return l.indexJunk ? 'hint.rmCached' : 'hint.amend'
  }
  if (!goodMessage(subjectOf(messageOf(l.git, l.head)))) return 'hint.amend'
  return 'hint.push'
}

function chips(): Chip[] {
  return [
    { command: 'git show --stat' },
    { command: 'git status' },
    { command: 'git rm -r --cached node_modules debug.log src/payment/calc.ts.bak' },
    { command: 'git commit --amend -m ""', cursorBack: 1 },
    { command: 'git reset HEAD~1' },
    { command: 'git push' },
  ]
}

function goals(world: World): StageGoal[] {
  const s = originState(world)
  return [
    { text: GOALS.fix, done: s.fix },
    { text: GOALS.only, done: s.fix && s.clean },
    { text: GOALS.one, done: s.fix && s.one },
  ]
}

/** ゴミごと push すると、作中18分かかる */
function durationOf(command: string, result: ExecuteResult): number | undefined {
  if (!/^\s*git\s+push\b/.test(command) || result.exitCode !== 0) return undefined
  return originState(result.world).junk ? 18 * 60 : undefined
}

export const RELEASE_26: StageDefinition = {
  id: 'release-26',
  number: '2-4',
  title: '本日26時リリース',
  mission: MISSION,
  situation: SITUATION,
  terminalIntro: 'まずは git show --stat で、さっきのコミットに何が入ったか見てみましょう。',
  intro: INTRO,
  home: HOME,
  workspace: ME,
  buildWorld,
  drama: {
    mode: 'practice',
    cast: ['kouhai', 'boss', 'senpai'],
    par: 3,
    // 作中30分（25:30 → 26:00）を、実時間5分で
    deadlineSec: 300,
    clockStart: '25:30',
    clockScale: 6,
    idleHelper: false,
    seed: 2530,
    lines: LINES,
  },
  policy: { player: PLAYER.name },
  checkpointOnFatal: false,
  evaluate,
  chips,
  goals,
  hint,
  hintSec: 120,
  durationOf,
  timeline: [{ id: 'wake', atSec: 15 * 60 }],
  onTime,
  reports: {},
  names: NAMES,
}
