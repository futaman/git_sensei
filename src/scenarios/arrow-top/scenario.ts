// ステージ 2-3「トップページに矢印」（docs/07）
// 教えること：出てしまったものは、消さずに直すコミットを足す。障害対応の最中も、拒否されたら pull。
// 解答手順（par 5）：index.html を直す → add → commit（田中が main に push してくる）→ push（拒否）→ pull → push
import type { ExecuteResult, World } from '../../engine/index.ts'
import { fileAt, fileOf, HOME, marked, npc, PLAYER, repo, tipOf, WorldBuilder } from '../kit.ts'
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
import { FILES, GOALS, INTRO, LINES, MISSION, NAMES, REPORTS, SITUATION } from './lines.ja.ts'

const ORIGIN = '/git.example.com/shop-app.git'
const ME = `${HOME}/shop-app`
const SENPAI = '/home/hayase/shop-app'
const TANAKA = '/home/tanaka/shop-app'
const INDEX = 'src/pages/index.html'
/** 問い合わせ1件あたりの対応コスト */
const COST_PER_INQUIRY = 1200
const OBSERVE = /^\s*(git\s+(status|log|diff|show)|ls|cat|pwd|cd)\b/

function buildWorld(now: Parameters<StageDefinition['buildWorld']>[0]) {
  return (
    new WorldBuilder(now, [HOME, '/home/tanaka'])
      .server(ORIGIN)
      .at(60 * 24 * 7)
      .founder(SENPAI, 'hayase', ORIGIN, FILES.base, 'init')
      .at(60 * 24 * 2)
      .run(HOME, 'git clone https://git.example.com/shop-app.git')
      .run(ME, 'git config pull.rebase false')
      // 昨日：英語のブランチと日本語の変更をマージして、印を残したまま push してしまった
      .at(60 * 20)
      .run(ME, 'git switch -c feature/english')
      .commit(ME, FILES.english, 'feat: 英語のトップページ')
      .run(ME, 'git switch main')
      .commit(ME, FILES.japanese, 'feat: 冬のセール')
      .tryRun(ME, 'git merge feature/english')
      .run(ME, 'git add .', 'git commit --no-edit', 'git push')
      .run('/home/tanaka', 'git clone https://git.example.com/shop-app.git')
      .run(TANAKA, 'git config pull.rebase false')
      .as(TANAKA, 'tanaka')
      .build()
  )
}

const originIndex = (world: World) => {
  const origin = repo(world, ORIGIN)
  const tip = tipOf(origin, 'main')
  return origin && tip ? fileAt(origin, tip, INDEX) : undefined
}
const fixed = (text: string | undefined) => text !== undefined && !marked(text)
const japanese = (text: string | undefined) =>
  typeof text === 'string' && text.includes('冬のセール') && !text.includes('WINTER SALE')

/** 問い合わせの件数：最初は3件、作中1分ごとに1件ずつ増える */
const inquiries = (gameSec: number) => 3 + Math.floor(gameSec / 60)

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
  if (/^\s*(cat|ls)\b/.test(command)) flag('looked')
  if (result.events.some((e) => e.type === 'PUSH_REJECTED')) flag('rejected')
  if (/--amend/.test(command) && result.exitCode === 0) {
    evaluation.notes.push({ from: 'senpai', key: 'senpai.noAmend' })
  }

  let world = result.world
  // 学習者の最初のコミットの直後に、田中が main に push してくる（状況の変化）
  if (
    result.events.some((e) => e.type === 'COMMIT_CREATED') &&
    !progress.flags.includes('tanakaPushed')
  ) {
    flag('tanakaPushed')
    const r = npc(world, TANAKA, '田中', [
      'git pull',
      { write: FILES.tanaka },
      "git commit -am 'fix: 送料の表示ゆれ'",
      'git push',
    ])
    world = r.world
    evaluation.world = world
    evaluation.npcLog = r.log
    evaluation.notes.push({ from: 'kouhai', key: 'kouhai.pushed' })
  }

  const text = originIndex(world)
  if (fixed(text) && !japanese(text) && result.events.some((e) => e.type === 'PUSHED')) {
    evaluation.notes.push({ from: 'kouhai', key: 'kouhai.wrongLang' })
  }
  evaluation.cleared = fixed(text) && japanese(text)
  if (evaluation.cleared) {
    const n = inquiries(ctx.gameSec)
    const vars = { n: String(n), cost: (n * COST_PER_INQUIRY).toLocaleString('ja-JP') }
    const script: NonNullable<StageEvaluation['ending']>['script'] =
      ctx.gameSec <= 300
        ? [
            { from: 'kouhai', key: 'ending.fast.kouhai' },
            { from: 'boss', key: 'ending.fast.boss' },
          ]
        : [{ from: 'system', key: 'ending.slow', vars }]
    script.push({ from: 'system', key: 'ending.cost', vars })
    evaluation.ending = { script }
  }
  void command
  return evaluation
}

function onTime(id: string): StageEvaluation {
  const evaluation = nothing()
  const n = Number(id.replace('inquiry.', ''))
  evaluation.notes.push({ from: 'kouhai', key: 'kouhai.inquiry', vars: { n: String(n) }, id })
  return evaluation
}

function status(_w: World, _p: StageProgress, gameSec: number): StageStatus[] {
  const n = inquiries(gameSec)
  return [
    { label: '問い合わせ', value: `${n}件`, tone: n >= 8 ? 'danger' : n >= 5 ? 'warn' : 'normal' },
    { label: '対応コスト', value: `¥${(n * COST_PER_INQUIRY).toLocaleString('ja-JP')}` },
  ]
}

function hint(world: World, progress: StageProgress): string {
  const git = repo(world, ME)
  const local = fileOf(world, ME, INDEX)
  const head = tipOf(git, 'main')
  const committed = git && head ? fileAt(git, head, INDEX) : undefined
  if (!fixed(committed) || !japanese(committed)) {
    if (marked(local)) return progress.flags.includes('looked') ? 'hint.fix' : 'hint.find'
    if (!japanese(local)) return 'hint.fix'
    const e = git?.index[INDEX]
    const staged = e && git ? git.objects[e.oid] : undefined
    return staged?.type === 'blob' && staged.content === local ? 'hint.commit' : 'hint.add'
  }
  return progress.flags.includes('rejected') && !progress.flags.includes('pulled')
    ? 'hint.pull'
    : 'hint.push'
}

function chips(world: World, progress: StageProgress): Chip[] {
  const list: Chip[] = [
    { command: 'ls src/pages' },
    { command: `cat ${INDEX}` },
    { command: `git add ${INDEX}` },
    { command: 'git commit -m ""', cursorBack: 1 },
    { command: 'git push' },
  ]
  if (progress.flags.includes('rejected')) list.push({ command: 'git pull --no-rebase' })
  void world
  return list
}

function goals(world: World): StageGoal[] {
  const text = originIndex(world)
  return [
    { text: GOALS.fix, done: fixed(text) },
    { text: GOALS.lang, done: japanese(text) },
  ]
}

export const ARROW_TOP: StageDefinition = {
  id: 'arrow-top',
  number: '2-3',
  title: 'トップページに矢印',
  mission: MISSION,
  situation: SITUATION,
  intro: INTRO,
  home: HOME,
  workspace: ME,
  buildWorld,
  drama: {
    mode: 'practice',
    cast: ['kouhai', 'boss', 'senpai'],
    par: 5,
    // 作中10分を、実時間5分で
    deadlineSec: 300,
    clockStart: '13:00',
    clockScale: 2,
    idleHelper: true,
    seed: 1300,
    lines: LINES,
  },
  // 障害対応なので、このステージだけ main への直接 push を危険にしない（保護ブランチなし）
  policy: { player: PLAYER.name },
  checkpointOnFatal: true,
  fatalKinds: ['FORCE_PUSH_OVERWROTE', 'HISTORY_REWRITTEN_ON_SHARED_BRANCH'],
  evaluate: (before, result, command, progress, ctx) => {
    if (/^\s*git\s+pull\b/.test(command) && result.exitCode === 0) {
      if (!progress.flags.includes('pulled')) progress.flags.push('pulled')
    }
    return evaluate(before, result, command, progress, ctx)
  },
  chips,
  goals,
  hint,
  hintSec: 120,
  // 障害対応で急いでいるので、ふつうのコマンドは30秒、エラーは1分
  durationOf: (command, result) => {
    if (OBSERVE.test(command)) return 0
    return result.exitCode === 0 ? 30 : 60
  },
  timeline: [5, 8, 12].map((n) => ({ id: `inquiry.${n}`, atSec: (n - 3) * 60 })),
  onTime,
  status,
  reports: REPORTS,
  names: NAMES,
}
