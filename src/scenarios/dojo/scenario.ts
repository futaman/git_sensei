// 外伝「やらかし道場」（docs/07）
// 危険を減点ではなく得点として扱う体験型。始末書図鑑の枠を埋め、損害額を稼ぐ。
// 役満：観測以外のコマンドを3つ続けて打つあいだに、3種類以上の危険（時計は止まっているので、手数で数える）
import { type DangerKind, isObservation } from '../../drama/index.ts'
import type { ExecuteResult, World } from '../../engine/index.ts'
import { HOME, PLAYER, WorldBuilder } from '../kit.ts'
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
  INTRO,
  LINES,
  MISSION,
  NAMES,
  REPORTS,
  SITUATION,
  SLOTS,
  TITLES,
  YAKUMAN,
} from './lines.ja.ts'

const ORIGIN = '/git.example.com/dojo.git'
const ME = `${HOME}/dojo`
const SENPAI = '/home/hayase/dojo'
const TANAKA = '/home/tanaka/dojo'

function buildWorld(now: Parameters<StageDefinition['buildWorld']>[0]) {
  return (
    new WorldBuilder(now, [HOME, '/home/tanaka'])
      .server(ORIGIN)
      .at(60 * 24 * 3)
      .founder(SENPAI, 'hayase', ORIGIN, FILES.base, 'init')
      // conflict-me：main と同じ行を変えたブランチ
      .run(SENPAI, 'git switch -c conflict-me')
      .commit(SENPAI, FILES.conflictBranch, 'feat: 英語のあいさつ')
      .run(SENPAI, 'git push -u origin conflict-me', 'git switch main')
      .commit(SENPAI, FILES.conflictMain, 'feat: 日本語のあいさつ')
      .run(SENPAI, 'git push')
      // shared：田中と共有しているブランチ
      .run(SENPAI, 'git switch -c shared')
      .commit(SENPAI, FILES.shared, 'docs: 共有メモ')
      .run(SENPAI, 'git push -u origin shared', 'git switch main')
      .at(60 * 24)
      .run(HOME, 'git clone https://git.example.com/dojo.git')
      .run(ME, 'git config pull.rebase false', 'git branch conflict-me origin/conflict-me')
      .run(ME, 'git switch shared')
      .commit(
        ME,
        { 'docs/shared.md': '# 共有メモ\n\n田中と一緒に書いている。\n自分の分も足した。\n' },
        'docs: 共有メモに追記',
      )
      .run(ME, 'git push', 'git switch main')
      // 田中が main に push した（まだ fetch していない）
      .at(60)
      .run('/home/tanaka', 'git clone https://git.example.com/dojo.git')
      .as(TANAKA, 'tanaka')
      .commit(TANAKA, FILES.tanaka, 'docs: 田中のメモ')
      .run(TANAKA, 'git push')
      // 罠：未追跡の .env と node_modules/
      .write(ME, FILES.traps)
      .build()
  )
}

/** これまでに埋めた枠（危険の種類） */
const got = (p: StageProgress): DangerKind[] => JSON.parse(p.memo.got ?? '[]') as DangerKind[]
const costOf = (kind: DangerKind) => SLOTS.find((s) => s.kind === kind)?.cost ?? 0
const total = (p: StageProgress) =>
  got(p).reduce((sum, k) => sum + costOf(k), 0) + Number(p.memo.bonus ?? '0')
const titleOf = (yen: number) => (TITLES.find((t) => yen >= t.min) ?? TITLES.at(-1))?.title ?? ''
const yen = (n: number) => `¥${n.toLocaleString('ja-JP')}`

function evaluate(
  _before: World,
  _result: ExecuteResult,
  command: string,
  progress: StageProgress,
  ctx: StageContext,
): StageEvaluation {
  const evaluation = nothing()
  const kinds = [...new Set(ctx.dangers.filter((d) => !d.allowed).map((d) => d.kind))]
  const before = total(progress)
  const have = got(progress)
  const fresh = kinds.filter((k) => !have.includes(k))
  if (fresh.length > 0) {
    progress.memo.got = JSON.stringify([...have, ...fresh])
    evaluation.notes.push(
      { from: 'senpai', key: 'senpai.newEntry', repeat: true },
      { from: 'kouhai', key: 'kouhai.newEntry', repeat: true },
    )
  }
  // 役満：観測以外のコマンドを3つ続けて打つあいだの危険を数える
  if (!isObservation(command)) {
    const window = [...(JSON.parse(progress.memo.window ?? '[]') as DangerKind[][]), kinds].slice(
      -3,
    )
    progress.memo.window = JSON.stringify(window)
    const union = [...new Set(window.flat())]
    if (union.length >= 3 && !progress.flags.includes('yakuman')) {
      progress.flags.push('yakuman')
      progress.memo.bonus = String(2 * union.reduce((sum, k) => sum + costOf(k), 0))
      evaluation.notes.push({ from: 'senpai', key: 'senpai.yakuman' })
    }
  }
  const after = total(progress)
  if (titleOf(after) !== titleOf(before)) {
    evaluation.notes.push({
      from: 'senpai',
      key: 'title.up',
      vars: { title: titleOf(after) },
      id: `title.${titleOf(after)}`,
    })
  }
  evaluation.cleared = SLOTS.every((s) => got(progress).includes(s.kind))
  if (evaluation.cleared) evaluation.ending = { script: [{ from: 'boss', key: 'boss.complete' }] }
  return evaluation
}

function goals(_world: World, progress: StageProgress): StageGoal[] {
  const have = got(progress)
  return [
    ...SLOTS.map((s, i) => ({
      text: have.includes(s.kind)
        ? `${i + 1}. ${s.name}（${yen(s.cost)}）`
        : `${i + 1}. ${s.riddle}`,
      done: have.includes(s.kind),
    })),
    {
      text: progress.flags.includes('yakuman')
        ? `11. ${YAKUMAN.name}（${yen(Number(progress.memo.bonus ?? '0'))}）`
        : `11. ${YAKUMAN.riddle}`,
      done: progress.flags.includes('yakuman'),
    },
  ]
}

function status(_w: World, progress: StageProgress): StageStatus[] {
  const sum = total(progress)
  return [
    {
      label: '損害額',
      value: yen(sum),
      tone: sum >= 5_000_000 ? 'danger' : sum > 0 ? 'warn' : 'normal',
    },
    { label: '称号', value: titleOf(sum) },
    { label: '図鑑', value: `${got(progress).length}/${SLOTS.length}` },
  ]
}

function hint(_world: World, progress: StageProgress): string {
  const next = SLOTS.find((s) => !got(progress).includes(s.kind))
  return next ? `hint.${next.kind}` : 'hint.done'
}

function chips(): Chip[] {
  return [
    { command: 'git status' },
    { command: 'git log --oneline --all' },
    { command: 'git add .env' },
    { command: 'git merge conflict-me' },
    { command: 'git switch shared' },
    { command: 'git push --force' },
  ]
}

export const DOJO: StageDefinition = {
  id: 'dojo',
  number: '外伝',
  title: 'やらかし道場',
  mission: MISSION,
  situation: SITUATION,
  terminalIntro:
    '右上の図鑑のなぞなぞを読んで、わざとやらかしてみましょう。上の「ヒント」で次の枠の答えが出ます。',
  intro: INTRO,
  home: HOME,
  workspace: ME,
  buildWorld,
  drama: {
    mode: 'experience',
    cast: ['kouhai', 'boss', 'senpai'],
    // 図鑑を埋めるのが目的なので、手数は気にしない
    par: 40,
    clockStart: '13:00',
    clockScale: 1,
    idleHelper: true,
    seed: 1300,
    lines: LINES,
  },
  policy: { player: PLAYER.name, protectedBranches: ['main'] },
  checkpointOnFatal: false,
  evaluate,
  chips,
  goals,
  hint,
  hintSec: 0,
  status,
  resetWorld: {
    label: '道場を元に戻す',
    note: { from: 'senpai', key: 'senpai.reset', repeat: true },
  },
  reports: REPORTS,
  names: NAMES,
}
