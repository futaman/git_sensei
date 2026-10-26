// ステージ 3-2「.env が漏れた」（docs/07）
// 教えること：秘密情報が漏れたら、履歴より先にキーを止める。.env は rm --cached で外して、普通のコミットで直す。
// 解答手順（par 4）：#dev で「キーの失効」→ git pull → git rm --cached .env → git commit → git push → 田中に声をかける
// S の条件：最初の行動が「キーの失効」（git のコマンドより先）
import { isObservation } from '../../drama/index.ts'
import type { ExecuteResult, World } from '../../engine/index.ts'
import { fileAt, HOME, npc, PLAYER, repo, tipOf, WorldBuilder } from '../kit.ts'
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
  NAMES,
  REPORTS,
  SITUATION,
} from './lines.ja.ts'

const ORIGIN = '/git.example.com/payment-sdk-sample.git'
const ME = `${HOME}/payment-sdk-sample`
const SENPAI = '/home/hayase/payment-sdk-sample'
const TANAKA = '/home/tanaka/payment-sdk-sample'

function buildWorld(now: Parameters<StageDefinition['buildWorld']>[0]) {
  return new WorldBuilder(now, [HOME, '/home/tanaka'])
    .server(ORIGIN)
    .at(60 * 24 * 30)
    .founder(SENPAI, 'hayase', ORIGIN, FILES.base, 'init')
    .at(60 * 24)
    .run(HOME, 'git clone https://git.example.com/payment-sdk-sample.git')
    .run(ME, 'git config pull.rebase false')
    .run('/home/tanaka', 'git clone https://git.example.com/payment-sdk-sample.git')
    .as(TANAKA, 'tanaka')
    .at(10)
    .commit(TANAKA, FILES.tanaka, 'feat: 決済のサンプルを追加')
    .run(TANAKA, 'git push')
    .build()
}

const originHasEnv = (world: World) => {
  const origin = repo(world, ORIGIN)
  const tip = tipOf(origin, 'main')
  return !!origin && !!tip && fileAt(origin, tip, '.env') !== undefined
}
const talkedToKouhai = (p: StageProgress) => p.choices.some((c) => c.startsWith('kouhai.'))
const revoked = (p: StageProgress) => p.choices.includes('revoke')

function finishIfDone(world: World, progress: StageProgress, evaluation: StageEvaluation): void {
  evaluation.cleared = revoked(progress) && !originHasEnv(world) && talkedToKouhai(progress)
  if (!evaluation.cleared) return
  const first = progress.flags.includes('revokeFirst')
  const script: NonNullable<StageEvaluation['ending']>['script'] = first
    ? [
        { from: 'boss', key: 'ending.revokeFirst' },
        { from: 'kouhai', key: 'kouhai.thanks' },
      ]
    : [{ from: 'boss', key: 'ending.revokeLate' }]
  if (progress.choices.includes('kouhai.teach'))
    script.push({ from: 'system', key: 'ending.taught' })
  evaluation.ending = { script, ...(first ? {} : { maxRank: 'A' as const }) }
}

function evaluate(
  _before: World,
  result: ExecuteResult,
  command: string,
  progress: StageProgress,
  ctx: StageContext,
): StageEvaluation {
  const evaluation = nothing()
  if (!isObservation(command) && !progress.flags.includes('acted')) progress.flags.push('acted')
  if (ctx.dangers.some((d) => d.kind === 'FORCE_PUSH_OVERWROTE' && !d.allowed)) {
    evaluation.notes.push({ from: 'senpai', key: 'senpai.overwritten' })
  }
  finishIfDone(result.world, progress, evaluation)
  return evaluation
}

function onChoice(id: string, world: World, progress: StageProgress): StageEvaluation {
  const evaluation = nothing()
  if (id === 'revoke') {
    if (!progress.flags.includes('acted')) progress.flags.push('revokeFirst')
    evaluation.notes.push({ from: 'kouhai', key: 'kouhai.revoked' })
  }
  if (id === 'announce') evaluation.notes.push({ from: 'senpai', key: 'senpai.announced' })
  if (id === 'kouhai.teach' || id === 'kouhai.cover') {
    evaluation.notes.push({ from: 'kouhai', key: 'kouhai.thanks', id: 'thanks.choice' })
  }
  if (id === 'kouhai.blame') evaluation.notes.push({ from: 'kouhai', key: 'kouhai.blamed' })
  finishIfDone(world, progress, evaluation)
  return evaluation
}

function onTime(id: string, world: World, progress: StageProgress): StageEvaluation {
  const evaluation = nothing()
  if (id === 'bot') evaluation.notes.push({ from: 'system', key: 'bot.detected' })
  if (id === 'senpaiPush') {
    const r = npc(world, SENPAI, '早瀬', [
      'git pull --no-rebase',
      { write: FILES.senpai },
      'git add .',
      "git commit -m 'docs: サンプルの説明を追加'",
      'git push',
    ])
    evaluation.world = r.world
    evaluation.npcLog = r.log
    if (r.ok) evaluation.notes.push({ from: 'senpai', key: 'senpai.pushed' })
  }
  // 締切までにキーを止めなかった：Lv5 の結末
  if (id === 'deadline' && !revoked(progress)) {
    evaluation.end = true
    evaluation.ending = {
      script: [
        { from: 'boss', key: 'ending.noRevoke.boss' },
        { from: 'system', key: 'ending.noRevoke.card' },
        { from: 'senpai', key: 'ending.noRevoke.senpai' },
      ],
    }
  }
  return evaluation
}

function hint(world: World, progress: StageProgress): string {
  if (!revoked(progress)) return 'hint.revoke'
  const git = repo(world, ME)
  const local = tipOf(git, 'main')
  const origin = tipOf(repo(world, ORIGIN), 'main')
  if (originHasEnv(world)) {
    if (git && origin && !git.objects[origin]) return 'hint.pull'
    if (git && Object.hasOwn(git.index, '.env')) return 'hint.rmCached'
    if (git && local && fileAt(git, local, '.env') !== undefined) return 'hint.commit'
    return 'hint.push'
  }
  return talkedToKouhai(progress) ? 'hint.push' : 'hint.kouhai'
}

function chips(): Chip[] {
  return [
    { command: 'git status' },
    { command: 'git pull' },
    { command: 'git rm --cached .env' },
    { command: 'git commit -m ""', cursorBack: 1 },
    { command: 'git push' },
  ]
}

function goals(world: World, progress: StageProgress): StageGoal[] {
  return [
    { text: GOALS.revoke, done: revoked(progress) },
    { text: GOALS.env, done: !originHasEnv(world) },
    { text: GOALS.kouhai, done: talkedToKouhai(progress) },
  ]
}

const KOUHAI = ['kouhai.teach', 'kouhai.blame', 'kouhai.cover']

export const ENV_LEAK: StageDefinition = {
  id: 'env-leak',
  number: '3-2',
  title: '.env が漏れた',
  mission: MISSION,
  situation: SITUATION,
  terminalIntro: 'git のコマンドの前に、#dev でできることもあります。',
  intro: INTRO,
  home: HOME,
  workspace: ME,
  buildWorld,
  drama: {
    mode: 'practice',
    cast: ['kouhai', 'boss', 'senpai'],
    par: 4,
    // 作中30分（10:00 → 10:30）を、実時間5分で
    deadlineSec: 300,
    clockStart: '10:00',
    clockScale: 6,
    idleHelper: true,
    seed: 1000,
    lines: LINES,
  },
  policy: { player: PLAYER.name },
  // 周知してからの --force-with-lease は許す。ただし早瀬の push の後は、早瀬のコミットまで消えるので許さない
  policyFor: (progress) => ({
    player: PLAYER.name,
    allow: (kind, command) =>
      (kind === 'FORCE_PUSH_OVERWROTE' || kind === 'HISTORY_REWRITTEN_ON_SHARED_BRANCH') &&
      progress.choices.includes('announce') &&
      command.includes('--force-with-lease') &&
      !progress.fired.includes('senpaiPush'),
  }),
  checkpointOnFatal: true,
  evaluate,
  chips,
  goals,
  hint,
  hintSec: 120,
  choices: CHOICES.map((c) => ({
    ...c,
    ...(KOUHAI.includes(c.id)
      ? { available: (_w: World, p: StageProgress) => !talkedToKouhai(p) }
      : {}),
  })),
  onChoice,
  timeline: [
    { id: 'bot', atSec: 60 },
    { id: 'senpaiPush', atSec: 180 },
    { id: 'deadline', atSec: 30 * 60 },
  ],
  onTime,
  reports: REPORTS,
  names: NAMES,
}
