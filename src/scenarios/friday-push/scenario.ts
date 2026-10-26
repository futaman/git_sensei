// ステージ「金曜17:45、定時前の push」
// 教えること：拒否された push は、取り込んでから出し直す。押し切らない。
// 解答手順（par 5）：git push（拒否）→ git pull（コンフリクト）→ calc.ts を直す → git add → git commit → git push
import {
  addWorkspace,
  createWorld,
  type ExecContext,
  type ExecuteResult,
  execute,
  findWorkspace,
  type GitDir,
  hasConflictMarkers,
  own,
  type World,
  writeFile,
} from '../../engine/index.ts'
import type { Chip, StageDefinition, StageEvaluation, StageGoal, StageProgress } from '../stage.ts'
import { GOALS, INTRO, LINES, MISSION, NAMES, REPORTS, SITUATION } from './lines.ja.ts'

export const PATHS = {
  home: '/home/you',
  me: '/home/you/payment-app',
  origin: '/srv/git/payment-app.git',
  tanaka: '/home/tanaka/payment-app',
} as const

export const CALC = 'src/payment/calc.ts'
const PLAYER = { name: 'あなた', email: 'you@example.com' }

const BASE_CALC = `export function calcFee(amount: number): number {
  const rate = 0.035
  return Math.round(amount * rate)
}
`
const MINE = BASE_CALC.replace('Math.round', 'Math.floor')
const TANAKA = BASE_CALC.replace('const rate = 0.035', 'const rate = 0.036 // 2026/11 料金改定')

const README = '# payment-app\n\n決済まわりのモジュール。\n'
const INDEX = "export { calcFee } from './calc'\n"

const noMarkers = (content: string) => !/^(<{7}|={7}|>{7})/m.test(content)
/** 自分の修正（端数の切り捨て）が入っているか */
const hasFloor = (content: string | undefined) =>
  typeof content === 'string' &&
  content.includes('Math.floor') &&
  !content.includes('Math.round') &&
  noMarkers(content)
/** 田中さんの修正（手数料率 3.6%）が入っているか */
const hasRate = (content: string | undefined) =>
  typeof content === 'string' &&
  content.includes('0.036') &&
  !content.includes('0.035') &&
  noMarkers(content)

/** 手数料率と端数の両方が、正しく入っているか */
export function calcIsCorrect(content: string | undefined): boolean {
  return hasFloor(content) && hasRate(content)
}

function must(world: World, line: string, workspace: string, now: ExecContext['now']): World {
  const r = execute(world, line, { workspace, now, tty: false })
  if (r.exitCode !== 0) throw new Error(`ステージの準備に失敗：${line}\n${r.stderr}`)
  return r.world
}

/**
 * 初期状態：自分の修正はコミット済み（まだ push していない）。田中さんの料金改定は push 済み。
 * どちらも calc.ts の隣り合った行を変えているので、pull するとコンフリクトになる
 */
function buildWorld(now: ExecContext['now']): World {
  // 少し前の時刻でコミットしたことにする（17:10 に土台、17:30 に自分の修正、17:40 に田中さん）
  const at = (minutesBefore: number) => ({ ...now, timestamp: now.timestamp - minutesBefore * 60 })
  let w = createWorld(
    { [PATHS.home]: { path: PATHS.home } },
    {
      'user.name': PLAYER.name,
      'user.email': PLAYER.email,
    },
  )
  for (const p of [PATHS.origin, PATHS.tanaka]) w = addWorkspace(w, p)
  w = must(w, 'git init --bare', PATHS.origin, at(35))

  // 田中さんがリポジトリを作って push した
  w = must(w, 'git init', PATHS.tanaka, at(35))
  w = must(w, "git config user.name '田中'", PATHS.tanaka, at(35))
  w = must(w, 'git config user.email tanaka@example.com', PATHS.tanaka, at(35))
  w = writeFile(w, PATHS.tanaka, 'README.md', README)
  w = writeFile(w, PATHS.tanaka, 'src/payment/index.ts', INDEX)
  w = writeFile(w, PATHS.tanaka, CALC, BASE_CALC)
  w = must(w, 'git add .', PATHS.tanaka, at(35))
  w = must(w, "git commit -m '決済モジュールを追加'", PATHS.tanaka, at(35))
  w = must(w, `git remote add origin ${PATHS.origin}`, PATHS.tanaka, at(35))
  w = must(w, 'git push -u origin main', PATHS.tanaka, at(35))

  // 自分がクローンして、端数の修正をコミットした（まだ push していない）
  w = must(w, `git clone ${PATHS.origin}`, PATHS.home, at(30))
  // チームの決まり：pull は merge で取り込む
  w = must(w, 'git config pull.rebase false', PATHS.me, at(30))
  w = writeFile(w, PATHS.me, CALC, MINE)
  w = must(w, "git commit -am 'fix: 決済手数料の端数を切り捨てに修正'", PATHS.me, at(15))

  // 田中さんが料金改定を push した
  w = writeFile(w, PATHS.tanaka, CALC, TANAKA)
  w = must(w, "git commit -am '料金改定：手数料率を3.6%に'", PATHS.tanaka, at(5))
  w = must(w, 'git push', PATHS.tanaka, at(5))
  return w
}

const repo = (world: World, path: string): GitDir | null =>
  findWorkspace(world, path)?.[1].git ?? null

/** origin の main の様子：自分の修正と、田中さんの修正（コミットごと）が入っているか */
function originState(world: World): { mine: boolean; tanaka: boolean } {
  const origin = repo(world, PATHS.origin)
  const tanaka = repo(world, PATHS.tanaka)
  const tip =
    origin && Object.hasOwn(origin.refs, 'refs/heads/main') ? origin.refs['refs/heads/main'] : null
  const tanakaTip = tanaka?.refs['refs/heads/main']
  if (!origin || !tip) return { mine: false, tanaka: false }
  const content = fileAt(origin, tip, CALC)
  return {
    mine: hasFloor(content),
    // 田中さんのコミットが残っている（origin の main から辿れる）
    tanaka: tanakaTip !== undefined && reaches(origin, tip, tanakaTip) && hasRate(content),
  }
}

/** force push で、origin の main から田中さんのコミットが消えたか */
function originIsForced(world: World): boolean {
  const origin = repo(world, PATHS.origin)
  const tip = origin?.refs['refs/heads/main']
  const tanakaTip = repo(world, PATHS.tanaka)?.refs['refs/heads/main']
  return !!origin && !!tip && !!tanakaTip && !reaches(origin, tip, tanakaTip)
}

/** origin の main に、田中さんのコミットが入っていて、calc.ts が正しいか */
export function originIsDone(world: World): boolean {
  const s = originState(world)
  return s.mine && s.tanaka
}

/** 画面に出すゴール。origin の状態から、達成したかをその場で判定する */
function goals(world: World): StageGoal[] {
  const s = originState(world)
  return [
    { text: GOALS.mine, done: s.mine },
    { text: GOALS.tanaka, done: s.tanaka },
  ]
}

/** あるコミットの、あるファイルの中身 */
function fileAt(git: GitDir, commitOid: string, path: string): string | undefined {
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

/** 解消したつもりの calc.ts から、どちらの変更が消えたか */
function lostChanges(content: string | undefined): { rate: boolean; floor: boolean } {
  return { rate: !content?.includes('0.036'), floor: !content?.includes('Math.floor') }
}

function evaluate(
  _before: World,
  result: ExecuteResult,
  _command: string,
  progress: StageProgress,
): StageEvaluation {
  const evaluation: StageEvaluation = { milestones: [], notes: [], cleared: false }
  const reach = (id: string) => {
    if (!progress.milestones.includes(id) && !evaluation.milestones.includes(id)) {
      evaluation.milestones.push(id)
    }
  }
  const me = findWorkspace(result.world, PATHS.me)?.[1]
  for (const e of result.events) {
    switch (e.type) {
      case 'PUSH_REJECTED':
        if (!progress.flags.includes('rejected')) progress.flags.push('rejected')
        break
      case 'MERGE_CONFLICT':
        reach('pulledConflict')
        break
      case 'CONFLICT_RESOLVED': {
        if (e.path !== CALC) break
        const content = me?.files[CALC]
        if (calcIsCorrect(content)) {
          reach('resolvedBoth')
        } else {
          // 「片方を採用」で片方の変更が消えた（危険ではなく、ゴールを満たさないだけ）
          const lost = lostChanges(content)
          if (lost.rate) evaluation.notes.push({ from: 'kouhai', key: 'kouhai.lostRate' })
          if (lost.floor) evaluation.notes.push({ from: 'kouhai', key: 'kouhai.lostFloor' })
        }
        break
      }
      case 'COMMIT_CREATED': {
        if (e.parents.length > 1 && calcIsCorrect(me?.files[CALC])) reach('mergeCommitted')
        // 田中さんのコミットを取り込んだ後なのに、どちらかの変更が消えたままコミットした（結末を変える）
        const git = me?.git
        const tanakaTip = repo(result.world, PATHS.tanaka)?.refs['refs/heads/main']
        if (!git || !tanakaTip || !reaches(git, e.oid, tanakaTip)) break
        const content = fileAt(git, e.oid, CALC)
        const flag = (f: string) => {
          if (!progress.flags.includes(f)) progress.flags.push(f)
        }
        if (!hasRate(content)) flag('committedLostRate')
        if (!hasFloor(content)) flag('committedLostFloor')
        break
      }
      case 'PUSHED': {
        const origin = repo(result.world, PATHS.origin)
        const tip = origin?.refs['refs/heads/main']
        const content = origin && tip ? fileAt(origin, tip, CALC) : undefined
        if (content !== undefined && !calcIsCorrect(content)) {
          const lost = lostChanges(content)
          if (lost.floor) evaluation.notes.push({ from: 'boss', key: 'boss.lostFloorPushed' })
          if (lost.rate) evaluation.notes.push({ from: 'kouhai', key: 'kouhai.lostRate' })
          // 押し切ったのでなければ、直すコミットを足せば取り返せる
          if (!originIsForced(result.world)) {
            evaluation.notes.push({ from: 'senpai', key: 'senpai.afterWrongPush' })
          }
        }
        break
      }
      default:
        break
    }
  }
  evaluation.cleared = originIsDone(result.world)
  if (evaluation.cleared) evaluation.ending = ending(progress)
  return evaluation
}

/** あるコミットから、target のコミットまで辿れるか */
function reaches(git: GitDir, from: string, target: string): boolean {
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

/**
 * いまどこにいるか。ヒント・先輩の助け舟・補助チップの出し分けに使う。
 * 「間違えた後」（片方の変更が消えた、ブランチから外れた、押し切った）も見分ける
 */
export type Phase =
  | 'beforePush' // まだ push していない
  | 'needPull' // 拒否された。取り込む前
  | 'conflict' // コンフリクトの印が残っている
  | 'conflictWrong' // 印は消えたが、片方の変更が消えている
  | 'conflictRight' // 正しく直した。add の前
  | 'mergeWrong' // add したが、片方の変更が消えている
  | 'mergeRight' // add した。commit の前
  | 'committedRight' // 正しいマージコミットがある。push の前
  | 'committedWrong' // 片方の変更が消えたままコミットした（push 済みのこともある）
  | 'fixed' // 間違えたコミットのあと、ファイルを直した。add・commit・push の前
  | 'forced' // force push で、origin から田中さんのコミットが消えた
  | 'detached' // HEAD がブランチから外れている

export function phaseOf(world: World, progress: StageProgress): Phase {
  const git = repo(world, PATHS.me)
  if (!git) return 'beforePush'
  if (git.head.type !== 'symbolic') return 'detached'
  const files = findWorkspace(world, PATHS.me)?.[1].files
  const content = files ? own(files, CALC) : undefined
  if (Object.keys(git.unmerged).length > 0) {
    if (typeof content === 'string' && hasConflictMarkers(content)) return 'conflict'
    return calcIsCorrect(content) ? 'conflictRight' : 'conflictWrong'
  }
  if (git.merge) return calcIsCorrect(content) ? 'mergeRight' : 'mergeWrong'

  if (originIsForced(world)) return 'forced'

  const tanakaTip = repo(world, PATHS.tanaka)?.refs['refs/heads/main']
  const head = git.refs['refs/heads/main']
  if (tanakaTip && head && reaches(git, head, tanakaTip)) {
    if (calcIsCorrect(fileAt(git, head, CALC))) return 'committedRight'
    return calcIsCorrect(content) ? 'fixed' : 'committedWrong'
  }
  return progress.flags.includes('rejected') ? 'needPull' : 'beforePush'
}

/**
 * 結末の出し分け。間違えて直したのは失敗ではなく、2番目に大事な学び（履歴は消さずに、直すコミットを足す）。
 * だから悪い結末ではなく、少しちがう結末にする。ランクは手数のぶん自然に下がるだけで、別には減点しない
 */
function ending(progress: StageProgress): StageEvaluation['ending'] {
  const lostRate = progress.flags.includes('committedLostRate')
  const recovered = lostRate || progress.flags.includes('committedLostFloor')
  if (!recovered) return undefined
  return {
    // 田中さんの 0.036 が一度消えたなら、「残してくれて」とは言えない
    replace: lostRate ? { 'ending.thanks': 'ending.thanksRecovered' } : undefined,
    epilogue: [{ from: 'senpai', key: 'ending.recovered' }],
  }
}

/** 補助チップ。--force は出さない（押し切る選択肢は、自分で打つしかない） */
function chips(world: World, progress: StageProgress): Chip[] {
  switch (phaseOf(world, progress)) {
    case 'beforePush':
      return [
        { command: 'git push' },
        { command: 'git status' },
        { command: 'git log --oneline --all' },
      ]
    case 'needPull':
      return [{ command: 'git pull' }, { command: 'git status' }]
    case 'conflict':
    case 'conflictWrong':
    case 'conflictRight':
    case 'mergeWrong':
      return [
        { command: 'git status' },
        { command: `git add ${CALC}` },
        { command: 'git merge --abort' },
      ]
    case 'mergeRight':
      return [{ command: 'git commit --no-edit' }, { command: 'git status' }]
    case 'committedRight':
      return [{ command: 'git push' }, { command: 'git log --oneline' }]
    case 'fixed':
      return [
        { command: `git add ${CALC}` },
        { command: 'git commit -m ""', cursorBack: 1 },
        { command: 'git push' },
      ]
    case 'committedWrong':
    case 'forced':
      return [{ command: 'git status' }, { command: 'git log --oneline --all' }]
    case 'detached':
      return [{ command: 'git switch main' }, { command: 'git status' }]
  }
}

/** ヒントで先輩が言うこと（いまの状態から、次の一手を具体的に） */
const HINT: Record<Phase, string> = {
  beforePush: 'hint.push',
  needPull: 'hint.pull',
  conflict: 'hint.resolve',
  conflictWrong: 'hint.redo',
  conflictRight: 'hint.add',
  mergeWrong: 'hint.fixBeforeCommit',
  mergeRight: 'hint.commit',
  committedRight: 'hint.pushAgain',
  committedWrong: 'hint.fixForward',
  fixed: 'hint.commitFix',
  forced: 'hint.forced',
  detached: 'hint.detached',
}

function hint(world: World, progress: StageProgress): string {
  return HINT[phaseOf(world, progress)]
}

/** 手が止まったときの先輩の声かけ。間違えた後だけ、方向を示す（ふだんは senpai.idle を段階的に） */
function helper(world: World, progress: StageProgress): string | undefined {
  switch (phaseOf(world, progress)) {
    case 'conflictWrong':
    case 'mergeWrong':
    case 'committedWrong':
      return 'senpai.idle.mistake'
    case 'forced':
      return 'senpai.idle.forced'
    case 'detached':
      return 'senpai.idle.detached'
    default:
      return undefined
  }
}

export const FRIDAY_PUSH: StageDefinition = {
  id: 'friday-push',
  title: '金曜17:45、定時前の push',
  mission: MISSION,
  situation: SITUATION,
  intro: INTRO,
  home: PATHS.home,
  workspace: PATHS.me,
  buildWorld,
  drama: {
    mode: 'practice',
    cast: ['kouhai', 'boss', 'senpai'],
    par: 5,
    // 作中15分（17:45 → 18:00）を、実時間5分で
    deadlineSec: 300,
    clockStart: '17:45',
    clockScale: 3,
    idleHelper: true,
    seed: 1745,
    lines: LINES,
  },
  policy: {
    player: PLAYER.name,
    // このステージで消える「まだコミットしていない変更」は、コンフリクトの解消の書きかけだけ。
    // reset --hard や checkout . でやり直すのは正しい取り消しなので、危険にしない
    allow: (kind) => kind === 'UNCOMMITTED_CHANGES_DISCARDED',
  },
  checkpointOnFatal: true,
  evaluate,
  chips,
  goals,
  hint,
  helper,
  // 作中15分しかないステージなので、ヒントは標準の5分ではなく2分にする（4回見ても間に合う）
  hintSec: 120,
  reports: REPORTS,
  names: NAMES,
}
