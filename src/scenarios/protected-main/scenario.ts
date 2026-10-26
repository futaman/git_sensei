// ステージ 1-3「火曜14:00、今日から main は保護」（docs/07）
// 教えること：switch -c と push -u。まだ commit していない変更は、ブランチを切っても持っていける。
// 解答手順（par 4）：git switch -c feature/receipt → git add . → git commit → git push -u origin feature/receipt
import type { ExecuteResult, World } from '../../engine/index.ts'
import { basicChips, fileAt, HOME, PLAYER, repo, tipOf, WorldBuilder } from '../kit.ts'
import {
  type Chip,
  nothing,
  type StageContext,
  type StageDefinition,
  type StageEvaluation,
  type StageGoal,
  type StageProgress,
} from '../stage.ts'
import { FILES, GOALS, INTRO, LINES, MISSION, NAMES, SITUATION } from './lines.ja.ts'

const ORIGIN = '/git.example.com/shop-app.git'
const ME = `${HOME}/shop-app`
const SENPAI = '/home/hayase/shop-app'
const PROTECTED = ['main']

function buildWorld(now: Parameters<StageDefinition['buildWorld']>[0]) {
  return new WorldBuilder(now, [HOME])
    .server(ORIGIN)
    .at(60 * 24 * 7)
    .founder(
      SENPAI,
      'hayase',
      ORIGIN,
      { 'README.md': '# shop-app\n', 'src/cart.ts': FILES.cart, 'src/index.ts': FILES.index },
      'init',
    )
    .at(120)
    .run(HOME, 'git clone https://git.example.com/shop-app.git')
    .write(ME, { 'src/receipt.ts': FILES.receipt, 'src/index.ts': FILES.indexWithReceipt })
    .build()
}

/** origin の feature/ ブランチのうち、2つの変更が入っているもの */
function featureOnOrigin(world: World): { name: string | null; complete: boolean } {
  const origin = repo(world, ORIGIN)
  if (!origin) return { name: null, complete: false }
  let found: string | null = null
  for (const ref of Object.keys(origin.refs).sort()) {
    if (!ref.startsWith('refs/heads/feature/')) continue
    const name = ref.slice('refs/heads/'.length)
    found ??= name
    const tip = origin.refs[ref] as string
    const ok =
      fileAt(origin, tip, 'src/receipt.ts') === FILES.receipt &&
      fileAt(origin, tip, 'src/index.ts') === FILES.indexWithReceipt
    if (ok) return { name, complete: true }
  }
  return { name: found, complete: false }
}

const currentBranch = (world: World) => {
  const git = repo(world, ME)
  return git?.head.type === 'symbolic' ? git.head.ref.replace('refs/heads/', '') : null
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
  if (result.exitCode !== 0) flag('hadError')
  if (/has no upstream branch/.test(result.stderr)) {
    evaluation.notes.push({ from: 'kouhai', key: 'kouhai.noUpstream' })
  }
  if (ctx.dangers.some((d) => d.kind === 'DIRECT_PUSH_TO_PROTECTED')) flag('directPush')

  // main から switch -c で抜けた：変更を持ったままなら上手。main で commit した後なら救出
  const from = currentBranch(before)
  const to = currentBranch(result.world)
  if (from === 'main' && to?.startsWith('feature/') && /switch\s+-c|checkout\s+-b/.test(command)) {
    const git = repo(before, ME)
    const originMain = tipOf(repo(before, ORIGIN), 'main')
    if (git && tipOf(git, 'main') !== originMain) {
      evaluation.notes.push({ from: 'senpai', key: 'senpai.rescued' })
      flag('rescued')
    } else {
      evaluation.notes.push({ from: 'kouhai', key: 'kouhai.smart', trust: 8 })
      flag('smart')
    }
  }

  const feature = featureOnOrigin(result.world)
  evaluation.cleared = feature.complete
  if (evaluation.cleared) {
    const script: NonNullable<StageEvaluation['ending']>['script'] = [
      { from: 'system', key: 'ending.reviewCard', vars: { branch: feature.name ?? '' } },
    ]
    if (progress.flags.includes('directPush')) {
      script.push({ from: 'boss', key: 'ending.directPush' })
    } else {
      script.push({ from: 'boss', key: 'ending.review' })
      if (progress.flags.includes('smart') && !progress.flags.includes('hadError')) {
        script.push({ from: 'kouhai', key: 'ending.noError' })
      }
    }
    evaluation.ending = {
      script,
      ...(progress.flags.includes('directPush') ? { maxRank: 'C' as const } : {}),
    }
  }
  return evaluation
}

function onTime(id: string): StageEvaluation {
  const evaluation = nothing()
  if (id === 'moveUp') {
    evaluation.notes.push({ from: 'boss', key: 'boss.moveUp' })
    // レビュー会が 14:30 から 14:20 に早まる（開始から作中20分）
    evaluation.deadlineSec = 20 * 60
  }
  return evaluation
}

function phase(world: World) {
  const git = repo(world, ME)
  const branch = currentBranch(world)
  const files = world.workspaces[ME]?.files ?? {}
  const indexed = (path: string) => {
    const e = git?.index[path]
    const blob = e && git ? git.objects[e.oid] : undefined
    return blob?.type === 'blob' ? blob.content : undefined
  }
  const head = branch && git ? tipOf(git, branch) : null
  const committed = !!git && !!head && fileAt(git, head, 'src/receipt.ts') === FILES.receipt
  const staged =
    indexed('src/receipt.ts') === files['src/receipt.ts'] &&
    indexed('src/index.ts') === files['src/index.ts']
  return { branch, committed, staged }
}

function hint(world: World): string {
  const p = phase(world)
  if (p.branch === 'main') return p.committed ? 'hint.rescue' : 'hint.branch'
  if (p.committed) return 'hint.push'
  return p.staged ? 'hint.commit' : 'hint.add'
}

function chips(world: World): Chip[] {
  const p = phase(world)
  if (p.branch === 'main') {
    return [{ command: 'git status' }, { command: 'git switch -c feature/receipt' }]
  }
  const list = basicChips(world, ME)
  if (p.committed && p.branch) {
    const i = list.findIndex((c) => c.command === 'git push')
    list.splice(i, 1, { command: `git push -u origin ${p.branch}` })
  }
  return list
}

function goals(world: World): StageGoal[] {
  const feature = featureOnOrigin(world)
  return [
    { text: GOALS.branch, done: feature.name !== null },
    { text: GOALS.files, done: feature.complete },
  ]
}

export const PROTECTED_MAIN: StageDefinition = {
  id: 'protected-main',
  number: '1-3',
  title: '火曜14:00、今日から main は保護',
  mission: MISSION,
  situation: SITUATION,
  intro: INTRO,
  home: HOME,
  workspace: ME,
  buildWorld,
  drama: {
    mode: 'experience',
    cast: ['kouhai', 'boss', 'senpai'],
    par: 4,
    // 作中30分（14:00 → 14:30）を、実時間5分で
    deadlineSec: 300,
    clockStart: '14:00',
    clockScale: 6,
    idleHelper: true,
    seed: 1400,
    lines: LINES,
  },
  policy: { player: PLAYER.name, protectedBranches: PROTECTED },
  checkpointOnFatal: false,
  evaluate,
  chips,
  goals,
  hint,
  hintSec: 120,
  timeline: [{ id: 'moveUp', atSec: 15 * 60 }],
  onTime,
  reports: {
    DIRECT_PUSH_TO_PROTECTED: {
      title: '保護された main への直接 push について',
      what: '今日から禁止になった main に、レビューを通さずに直接 push した',
      why: 'main はみんなが使う土台。レビューを飛ばすと、間違いがそのまま全員に広がる。保護は、それを防ぐための決まり',
      howToFix:
        '入ってしまったものは、レビュー会で一緒に見てもらう。必要なら、元に戻すコミット（revert）を足す',
      prevention:
        '作業はブランチで。git switch -c feature/○○ で切ってから commit して、git push -u origin feature/○○',
      bossWord: 'レビューを飛ばすな。ブランチを切れ',
    },
  },
  names: NAMES,
}
