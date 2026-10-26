// 外伝「やらかし道場」のセリフと始末書（docs/07。演出案のセッションの素材）。
// 本番でやったら終わることを、研修用のリポジトリで全部やる。始末書図鑑を埋め、損害額を稼ぐ。
import type { Character, DangerKind } from '../../drama/index.ts'
import type { StageDefinition } from '../stage.ts'

export const NAMES: Record<Character, string> = {
  boss: '黒岩部長',
  kouhai: '田中',
  senpai: '早瀬先輩',
  system: '道場',
}

export const MISSION = { task: '始末書図鑑を埋める', due: '時間制限なし' }

export const SITUATION: StageDefinition['situation'] = [
  '研修用のリポジトリ dojo です。わざと罠だらけにしてあります。main は保護、.env と node_modules/ が置いてあり、origin にはまだ fetch していない田中のコミットがあります。',
  'conflict-me ブランチは main とマージするとコンフリクトし、shared ブランチは田中と共有しています。右上の図鑑の空き枠には、なぞなぞだけが書いてあります。',
]

export const INTRO: StageDefinition['intro'] = [
  {
    from: 'senpai',
    text: '研修用のリポジトリを用意した。本番でやったら終わることを、今日ここで全部やっとけ',
  },
  { from: 'kouhai', text: '…ほんとにいいんですか？' },
  { from: 'boss', text: '本番でやるよりは、安い' },
]

/** 図鑑の枠：なぞなぞと、危険の種類と、損害額（円） */
export const SLOTS: { kind: DangerKind; riddle: string; name: string; cost: number }[] = [
  {
    kind: 'BAD_COMMIT_MESSAGE',
    riddle: '半年後の誰にも読めない一行',
    name: '読めないメッセージ',
    cost: 0,
  },
  { kind: 'JUNK_STAGED', riddle: '12,483個の荷物', name: 'node_modules の add', cost: 12480 },
  {
    kind: 'CONFLICT_MARKER_COMMITTED',
    riddle: '矢印を刺したまま',
    name: '印のままのコミット',
    cost: 38000,
  },
  { kind: 'COMMITS_ORPHANED', riddle: '名もなき迷子', name: '迷子のコミット', cost: 12480 },
  {
    kind: 'DIRECT_PUSH_TO_PROTECTED',
    riddle: 'レビューを飛び越えて',
    name: 'main への直接 push',
    cost: 380000,
  },
  {
    kind: 'HISTORY_REWRITTEN_ON_SHARED_BRANCH',
    riddle: 'みんなの過去を書き換える',
    name: '共有ブランチの書き換え',
    cost: 420000,
  },
  {
    kind: 'FORCE_PUSH_OVERWROTE',
    riddle: '仲間の仕事を、なかったことに',
    name: '仲間のコミットの消失',
    cost: 4200000,
  },
  { kind: 'SECRET_PUSHED', riddle: '鍵をばらまく', name: '秘密情報の push', cost: 48000000 },
  {
    kind: 'UNCOMMITTED_CHANGES_DISCARDED',
    riddle: '書きかけを、まとめて捨てる',
    name: '作業の消失',
    cost: 240000,
  },
  { kind: 'REPO_DELETED', riddle: '家ごと消す', name: '.git の削除', cost: 0 },
]

export const YAKUMAN = { riddle: '三つ続けて（役満。おまけ）', name: '役満（おまけ）' }

/** 称号（損害額の合計で決まる） */
export const TITLES: { min: number; title: string }[] = [
  { min: 50_000_000, title: '伝説の人' },
  { min: 5_000_000, title: '歩く障害報告書' },
  { min: 500_000, title: '始末書コレクター' },
  { min: 50_000, title: 'ヒヤリハット職人' },
  { min: 0, title: '見習い' },
]

export const LINES: Record<string, string[]> = {
  'senpai.idle': [
    '図鑑の空いてる枠、なぞなぞ読んでみ',
    '3手続けて3つやると、役満だよ',
    '元に戻すボタンもあるから、気にせずやっちゃって',
  ],
  'senpai.newEntry': ['はい、1枚。本番ではやるなよ'],
  'senpai.yakuman': ['…役満。こんなの、研修でしか見られない'],
  'kouhai.newEntry': ['（メモしとこ…）', 'うわぁ…', '先輩、楽しそうですね…'],
  'boss.complete': ['…全部やったか。本番では、ひとつもやるな'],
  'senpai.reset': ['元に戻しといた。図鑑と損害額はそのまま'],
  'title.up': ['称号：{title}'],
  'hint.BAD_COMMIT_MESSAGE': ['何かを変えて、git commit -m "fix" とか。半年後に誰も読めないやつ'],
  'hint.JUNK_STAGED': ['git add node_modules。荷物がいっぱい'],
  'hint.CONFLICT_MARKER_COMMITTED': [
    'git merge conflict-me で矢印が出たら、直さずに add して commit',
  ],
  'hint.COMMITS_ORPHANED': [
    'git switch --detach でブランチから降りて、commit してから git switch main',
  ],
  'hint.DIRECT_PUSH_TO_PROTECTED': [
    'main は保護してある。pull してから commit して、そのまま git push',
  ],
  'hint.HISTORY_REWRITTEN_ON_SHARED_BRANCH': [
    'git switch shared して、git commit --amend してから git push --force',
  ],
  'hint.FORCE_PUSH_OVERWROTE': [
    'main で fetch せずに git push --force。origin には田中のコミットがある',
  ],
  'hint.SECRET_PUSHED': ['git add .env して commit、push。鍵をばらまく'],
  'hint.UNCOMMITTED_CHANGES_DISCARDED': ['README.md を書き換えて、commit せずに git reset --hard'],
  'hint.REPO_DELETED': ['rm -rf .git。家ごと消える。戻すときは上の「道場を元に戻す」'],
  'hint.done': ['図鑑、全部埋まったね。役満も狙ってみ'],
}

export { GENERIC_REPORTS as REPORTS } from '../reports.ja.ts'

export const FILES = {
  base: {
    'README.md': '# dojo\n\n研修用のリポジトリです。\n',
    'src/app.ts': "export const greet = () => 'hello'\n",
  },
  conflictMain: { 'src/app.ts': "export const greet = () => 'こんにちは'\n" },
  conflictBranch: { 'src/app.ts': "export const greet = () => 'hello, world'\n" },
  shared: { 'docs/shared.md': '# 共有メモ\n\n田中と一緒に書いている。\n' },
  tanaka: { 'docs/tanaka.md': '# 田中のメモ\n' },
  traps: {
    '.env': 'PAYMENT_API_KEY=dojo-0000-not-real\n',
    'node_modules/left-pad/index.js': 'module.exports = () => {}\n',
    'node_modules/left-pad/package.json': '{ "name": "left-pad" }\n',
  },
}
