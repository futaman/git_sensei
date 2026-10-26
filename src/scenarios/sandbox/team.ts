// フリーモード「チームで練習」の舞台。サーバー（origin）と、先輩・後輩のクローンを用意する。
// プレイヤーは自分のホームで git clone してから参加する。
import {
  addWorkspace,
  createWorld,
  type ExecContext,
  execute,
  type World,
} from '../../engine/index.ts'
import { type Actor, type NpcBeat, runBeat } from '../npc.ts'

export const TEAM_PATHS = {
  home: '/home/you',
  origin: '/srv/git/team-project.git',
  senpai: '/home/senpai/team-project',
  kouhai: '/home/kouhai/team-project',
} as const

export const TEAM_ACTORS: Record<string, Actor> = {
  senpai: { name: '先輩 佐藤', workspace: TEAM_PATHS.senpai },
  kouhai: { name: '後輩 田中', workspace: TEAM_PATHS.kouhai },
}

const README_V1 = '# team-project\n\nチームで開発しているWebアプリです。\n'
const README_V2 = `${README_V1}\n## セットアップ\n\n1. git clone する\n2. npm install する\n`

/** 先輩がプロジェクトを始め、後輩がクローンしたところまで */
const SETUP: NpcBeat = {
  id: 'setup',
  title: '準備',
  actions: [
    { actor: 'senpai', run: 'git init' },
    { actor: 'senpai', run: "git config user.name '先輩 佐藤'" },
    { actor: 'senpai', run: 'git config user.email senpai@example.com' },
    { actor: 'senpai', write: ['README.md', README_V1] },
    { actor: 'senpai', write: ['src/app.js', "console.log('team-project')\n"] },
    { actor: 'senpai', run: 'git add .' },
    { actor: 'senpai', run: "git commit -m 'プロジェクトを作成'" },
    { actor: 'senpai', run: `git remote add origin ${TEAM_PATHS.origin}` },
    { actor: 'senpai', run: 'git push -u origin main' },
  ],
}

/** ボタンを押すたびに1つずつ進む、同僚の作業 */
export const TEAM_BEATS: NpcBeat[] = [
  {
    id: 'kouhai-readme',
    title: '後輩 田中 が README にセットアップ手順を書いて push',
    actions: [
      { actor: 'kouhai', run: 'git pull' },
      { actor: 'kouhai', write: ['README.md', README_V2] },
      { actor: 'kouhai', run: "git commit -am 'READMEにセットアップ手順を追加'" },
      { actor: 'kouhai', run: 'git push' },
    ],
  },
  {
    id: 'kouhai-feature',
    title: '後輩 田中 がログイン機能のブランチを作って push',
    actions: [
      { actor: 'kouhai', run: 'git switch -c feature/login' },
      { actor: 'kouhai', write: ['src/login.js', 'export function login() {\n  // TODO\n}\n'] },
      { actor: 'kouhai', run: 'git add .' },
      { actor: 'kouhai', run: "git commit -m 'ログイン機能のひな形'" },
      { actor: 'kouhai', run: 'git push -u origin feature/login' },
      { actor: 'kouhai', run: 'git switch main' },
    ],
  },
  {
    id: 'senpai-config',
    title: '先輩 佐藤 が main に設定ファイルを追加して push',
    actions: [
      { actor: 'senpai', run: 'git pull' },
      { actor: 'senpai', write: ['config.json', '{\n  "port": 3000\n}\n'] },
      { actor: 'senpai', run: 'git add config.json' },
      { actor: 'senpai', run: "git commit -m '設定ファイルを追加'" },
      { actor: 'senpai', run: 'git push' },
    ],
  },
  {
    id: 'kouhai-env',
    title: '後輩 田中 がうっかり .env をコミットして push',
    actions: [
      { actor: 'kouhai', run: 'git pull' },
      { actor: 'kouhai', write: ['.env', 'API_KEY=sk-live-0123456789abcdef\n'] },
      { actor: 'kouhai', run: 'git add .' },
      { actor: 'kouhai', run: "git commit -m '設定を更新'" },
      { actor: 'kouhai', run: 'git push' },
    ],
  },
]

/** 舞台を組み立てる。時刻は呼び出し側から受け取る（エンジンと同じく決定的にするため） */
export function buildTeamWorld(
  now: ExecContext['now'],
  player: { name: string; email: string },
): World {
  let w = createWorld(
    { [TEAM_PATHS.home]: { path: TEAM_PATHS.home } },
    {
      'user.name': player.name,
      'user.email': player.email,
    },
  )
  for (const p of [TEAM_PATHS.origin, TEAM_PATHS.senpai, '/home/kouhai']) w = addWorkspace(w, p)
  const ctx = (workspace: string): ExecContext => ({ workspace, now, tty: false })
  const must = (world: World, line: string, workspace: string): World => {
    const r = execute(world, line, ctx(workspace))
    if (r.exitCode !== 0) throw new Error(`舞台の準備に失敗：${line}\n${r.stderr}`)
    return r.world
  }
  w = must(w, 'git init --bare', TEAM_PATHS.origin)
  const setup = runBeat(w, SETUP, TEAM_ACTORS, now)
  if (setup.failed) throw new Error(`舞台の準備に失敗：${setup.failed.command}`)
  w = must(setup.world, `git clone ${TEAM_PATHS.origin}`, '/home/kouhai')
  w = must(w, "git config user.name '後輩 田中'", TEAM_PATHS.kouhai)
  w = must(w, 'git config user.email kouhai@example.com', TEAM_PATHS.kouhai)
  return w
}
