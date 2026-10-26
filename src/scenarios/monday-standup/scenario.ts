// ステージ 1-2「月曜9:55、朝会の前に」（docs/07）
// 教えること：add → commit → push と、コミットメッセージは人が読むものだということ。push 前なら --amend。
// 解答手順（par 5）：README を直す → add → commit（部長が CONTRIBUTING を足す）→ 直す → add → commit --amend → push
import type { ExecuteResult, World } from '../../engine/index.ts'
import {
  basicChips,
  fileAt,
  fileOf,
  HOME,
  isBadMessage,
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
  CONTRIBUTING,
  EXAMPLE_RULE,
  GOALS,
  INTRO,
  LINES,
  MISSION,
  NAMES,
  README,
  SITUATION,
} from './lines.ja.ts'

const ORIGIN = '/git.example.com/shop-app.git'
const ME = `${HOME}/shop-app`
const SENPAI = '/home/hayase/shop-app'

const readmeOk = (text: string | undefined) =>
  typeof text === 'string' && text.includes('git clone') && !text.includes('clnoe')
const contribOk = (text: string | undefined) => typeof text === 'string' && !text.includes('自由')

function buildWorld(now: Parameters<StageDefinition['buildWorld']>[0]) {
  return new WorldBuilder(now, [HOME])
    .server(ORIGIN)
    .at(60 * 24 * 3)
    .founder(
      SENPAI,
      'hayase',
      ORIGIN,
      {
        'README.md': README,
        'CONTRIBUTING.md': CONTRIBUTING,
        'src/cart.ts':
          'export const total = (items: number[]) => items.reduce((a, b) => a + b, 0)\n',
      },
      'init',
    )
    .at(30)
    .run(HOME, `git clone https://git.example.com/shop-app.git`)
    .run(ME, 'git config pull.rebase false')
    .build()
}

/** origin の main の、開始時の先端（自分のコミットを数えるときの起点） */
function initialTip(world: World): string | null {
  const senpai = repo(world, SENPAI)
  return tipOf(senpai, 'main')
}

/** 開始後に自分が origin の main に入れたコミットの件名（新しい順） */
function pushedSubjects(world: World): string[] {
  const origin = repo(world, ORIGIN)
  const start = initialTip(world)
  let cur = tipOf(origin, 'main')
  const out: string[] = []
  while (origin && cur && cur !== start) {
    const c = origin.objects[cur]
    if (c?.type !== 'commit') break
    if (c.author.name === PLAYER.name) out.push(subjectOf(c.message))
    cur = c.parents[0] ?? null
  }
  return out
}

function originFile(world: World, path: string): string | undefined {
  const origin = repo(world, ORIGIN)
  const tip = tipOf(origin, 'main')
  return origin && tip ? fileAt(origin, tip, path) : undefined
}

function evaluate(
  _before: World,
  result: ExecuteResult,
  _command: string,
  progress: StageProgress,
  _ctx: StageContext,
): StageEvaluation {
  const evaluation = nothing()
  const flag = (f: string) => {
    if (!progress.flags.includes(f)) progress.flags.push(f)
  }
  for (const e of result.events) {
    if (e.type === 'COMMIT_CREATED') {
      if (!e.amend && !progress.milestones.includes('committed')) {
        evaluation.milestones.push('committed')
        // 最初のコミットの直後に、部長が仕事を足す（状況の変化）
        evaluation.notes.push({ from: 'boss', key: 'boss.addMore' })
        flag('addMore')
      }
      if (e.amend) {
        if (progress.flags.includes('pushedSinceCommit')) {
          evaluation.notes.push({ from: 'senpai', key: 'senpai.afterPushAmend' })
          flag('amendAfterPush')
        } else if (progress.flags.includes('addMore')) {
          evaluation.notes.push({ from: 'kouhai', key: 'kouhai.smart', trust: 8 })
        }
      }
      progress.flags = progress.flags.filter((f) => f !== 'pushedSinceCommit')
    }
    if (e.type === 'PUSHED') flag('pushedSinceCommit')
  }
  const world = result.world
  evaluation.cleared =
    progress.flags.includes('addMore') &&
    readmeOk(originFile(world, 'README.md')) &&
    contribOk(originFile(world, 'CONTRIBUTING.md'))
  if (evaluation.cleared) evaluation.ending = ending(world)
  return evaluation
}

function ending(world: World): StageEvaluation['ending'] {
  const subjects = pushedSubjects(world)
  const bad = subjects.find(isBadMessage)
  // 部長が読み上げるのは、最初に入れたコミット（README を直したもの）
  const message = bad ?? subjects.at(-1) ?? ''
  const script: NonNullable<StageEvaluation['ending']>['script'] = bad
    ? [
        { from: 'boss', key: 'ending.readBad', vars: { message } },
        { from: 'kouhai', key: 'ending.readBadKouhai' },
      ]
    : [{ from: 'boss', key: 'ending.readOk', vars: { message } }]
  // 隠し：CONTRIBUTING に、例文ではない自分の言葉で10文字以上書いた
  const added = (originFile(world, 'CONTRIBUTING.md') ?? '')
    .split('\n')
    .map((l) => l.replace(/^[-*]\s*/, '').trim())
    .filter((l) => l !== '' && !CONTRIBUTING.includes(l))
  if (added.some((l) => l.length >= 10 && l !== EXAMPLE_RULE)) {
    script.push(
      { from: 'boss', key: 'ending.hidden.boss1' },
      { from: 'kouhai', key: 'ending.hidden.kouhai' },
      { from: 'boss', key: 'ending.hidden.boss2' },
    )
  }
  return { script, ...(bad ? { maxRank: 'B' as const } : {}) }
}

function onTime(id: string, world: World): StageEvaluation {
  const evaluation = nothing()
  if (id !== 'standup') return evaluation
  if (readmeOk(originFile(world, 'README.md'))) {
    evaluation.notes.push(
      { from: 'boss', key: 'ending.contribMissing' },
      { from: 'senpai', key: 'ending.contribMissingSenpai' },
    )
  } else {
    evaluation.notes.push({ from: 'system', key: 'ending.lateStandup' })
  }
  return evaluation
}

/** 作業ツリー・index・手元のコミットの様子 */
function situation(world: World, progress: StageProgress) {
  const git = repo(world, ME)
  const indexed = (path: string) => {
    const e = git ? git.index[path] : undefined
    const blob = e && git ? git.objects[e.oid] : undefined
    return blob?.type === 'blob' ? blob.content : undefined
  }
  const head = tipOf(git, 'main')
  const committed = (path: string) => (git && head ? fileAt(git, head, path) : undefined)
  const origin = repo(world, ORIGIN)
  const originTip = tipOf(origin, 'main')
  return {
    readmeFile: readmeOk(fileOf(world, ME, 'README.md')),
    readmeStaged: readmeOk(indexed('README.md')),
    readmeCommitted: readmeOk(committed('README.md')),
    contribFile: contribOk(fileOf(world, ME, 'CONTRIBUTING.md')),
    contribStaged: contribOk(indexed('CONTRIBUTING.md')),
    contribCommitted: contribOk(committed('CONTRIBUTING.md')),
    addMore: progress.flags.includes('addMore'),
    pushed: progress.flags.includes('pushedSinceCommit'),
    diverged: !!git && !!originTip && !!head && head !== originTip && !git.objects[originTip],
    ahead: head !== originTip,
    amendAfterPush: progress.flags.includes('amendAfterPush'),
  }
}

function hint(world: World, progress: StageProgress): string {
  const s = situation(world, progress)
  if (!s.readmeFile) return 'hint.edit'
  if (!s.readmeStaged) return 'hint.add'
  if (!s.readmeCommitted) return 'hint.commit'
  if (!s.addMore) return 'hint.push'
  if (!s.contribFile) return 'hint.contrib'
  if (!s.contribCommitted) {
    if (!s.contribStaged) return s.pushed ? 'hint.add' : 'hint.amend'
    return s.pushed ? 'hint.commit' : 'hint.amend'
  }
  if (s.amendAfterPush) return 'hint.pull'
  return 'hint.pushAll'
}

function chips(world: World, progress: StageProgress): Chip[] {
  const s = situation(world, progress)
  const list = basicChips(world, ME)
  if (s.addMore && !s.pushed && s.contribStaged && !s.contribCommitted) {
    list.splice(2, 0, { command: 'git commit --amend --no-edit' })
  }
  if (s.amendAfterPush) list.push({ command: 'git pull --no-rebase' })
  return list
}

function goals(world: World, progress: StageProgress): StageGoal[] {
  const list: StageGoal[] = [{ text: GOALS.readme, done: readmeOk(originFile(world, 'README.md')) }]
  if (progress.flags.includes('addMore')) {
    list.push({ text: GOALS.contributing, done: contribOk(originFile(world, 'CONTRIBUTING.md')) })
  }
  return list
}

/** コマンドの所要時間：朝会まで5分しかないので、ふつうは20秒、エラーは40秒 */
function durationOf(command: string, result: ExecuteResult): number | undefined {
  if (/^\s*(git\s+(status|log|diff|show)|ls|cat|pwd)\b/.test(command)) return 0
  return result.exitCode === 0 ? 20 : 40
}

export const MONDAY_STANDUP: StageDefinition = {
  id: 'monday-standup',
  number: '1-2',
  title: '月曜9:55、朝会の前に',
  mission: MISSION,
  situation: SITUATION,
  intro: INTRO,
  home: HOME,
  workspace: ME,
  buildWorld,
  drama: {
    mode: 'experience',
    cast: ['kouhai', 'boss', 'senpai'],
    par: 5,
    deadlineSec: 300,
    clockStart: '09:55',
    clockScale: 1,
    idleHelper: true,
    seed: 955,
    lines: LINES,
  },
  policy: { player: PLAYER.name },
  checkpointOnFatal: true,
  evaluate,
  chips,
  goals,
  hint,
  hintSec: 60,
  durationOf,
  timeline: [{ id: 'standup', atSec: 300 }],
  onTime,
  reports: {
    BAD_COMMIT_MESSAGE: {
      title: '読めないコミットメッセージについて',
      what: 'コミットメッセージに「修正」のような、何をしたか分からない言葉を書いた',
      why: 'コミットメッセージは、半年後の自分やチームが履歴を読むための手紙。「修正」では、何をなぜ変えたのか誰にも分からない',
      howToFix:
        'まだ push していなければ git commit --amend -m "…" で書き直せる。push した後なら、そのままにして次から気をつける',
      prevention:
        '「何を」「なぜ」を1行目に書く。docs: / fix: / feat: のように種類を付けると、読みやすくなる',
      bossWord: '朝会で読まれて困るメッセージは、書くな',
    },
    HISTORY_REWRITTEN_ON_SHARED_BRANCH: {
      title: 'push 済みのコミットを amend して force push したことについて',
      what: 'すでに main に push したコミットを --amend で作り直し、git push --force で origin の履歴を書き換えた',
      why: 'push したコミットは、ほかの人がもう取り込んでいるかもしれない。書き換えると、その人の手元の履歴と食い違う',
      howToFix:
        '書き換えたことをチームに伝える。取り込んだ人には、git fetch して origin/main に合わせてもらう',
      prevention: 'push した後の直しは、amend ではなく新しいコミットを足す',
      bossWord: 'みんなの main だ。書き換えるな',
    },
  },
  names: NAMES,
}
