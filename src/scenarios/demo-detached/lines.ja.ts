// 「デモ5分前」のセリフと始末書（docs/07 の 2-1。演出案のセッションの素材）。
import type { Character } from '../../drama/index.ts'
import type { StageDefinition } from '../stage.ts'

export const NAMES: Record<Character, string> = {
  boss: '黒岩部長',
  kouhai: '田中',
  senpai: '早瀬先輩',
  system: '取引先',
}

export const MISSION = { task: '昨夜の修正を demo 環境に出す', due: '15:00 デモ開始' }

export const SITUATION: StageDefinition['situation'] = [
  '15時から取引先デモです。demo 環境は、origin の demo ブランチから自動で出ます。',
  '昨夜、v1.2 の画面を見るために過去のコミットへ移動し、そのままそこで購入ボタンの文言を直してコミットしました。そのコミットは、まだどのブランチにも入っていません。',
]

export const GOALS = {
  demo: 'origin の demo に、購入ボタンの修正（カートに入れる）を入れる',
}

export const INTRO: StageDefinition['intro'] = [
  { from: 'boss', text: '15時から取引先デモだ。昨日の修正、demo に出てるな？' },
  { from: 'kouhai', text: '待機室に、もう1人入ってきました' },
  { from: 'senpai', text: 'git status、見てみ。いまどこにいる？' },
]

export const LINES: Record<string, string[]> = {
  'senpai.idle': [
    'git status の1行目、読んでみ',
    'detached って、どのブランチにも乗ってないってこと',
    'そのコミット、まずブランチに乗せてあげよ',
  ],
  'hint.status': ['git status。いまどこにいるか、1行目に書いてある'],
  'hint.branch': ['git switch -c demo-fix。いまのコミットに名前をつけて乗る'],
  'hint.toDemo': ['名前がついたら git switch demo'],
  'hint.merge': ['git merge demo-fix で、修正を demo に取り込む'],
  'hint.push': ['git push。demo 環境に出るよ'],
  'hint.rescue': ['さっきの Warning に、ハッシュと git branch の打ち方が書いてあるよ'],
  'kouhai.orphaned': ['…いま、昨日の修正、どこ行きました？'],
  'senpai.afterOrphan': ['大丈夫、まだ消えてない。出力をよく読んで'],
  'kouhai.waiting': ['待機室、{n}人になりました'],
  'boss.deadlineUrgent': ['…まだか'],
  'milestone.onBranch': ['あ、ブランチに乗った'],
  'milestone.rescued': ['戻ってきた…！'],
  'ending.client': ['このボタン、わかりやすいですね'],
  'ending.onTime': ['…よし'],
  'ending.rescued': ['出力に書いてあったでしょ？ git はちゃんと教えてくれてる'],
  'ending.late': ['…v1.2 の画面でデモした'],
  'ending.lateKouhai': ['（ボタンの文字、古いままだった…）'],
}

export const REPORTS: StageDefinition['reports'] = {
  COMMITS_ORPHANED: {
    title: 'detached HEAD のコミットを置き去りにしたことについて',
    what: 'どのブランチにも入っていないコミット「fix: 購入ボタンを『カートに入れる』に」があるまま、git switch demo で移動した',
    why: 'detached HEAD で作ったコミットは、ブランチから外れている。移動すると、どこからもたどれなくなり、log にも出なくなる',
    howToFix:
      '移動したときの Warning にハッシュが出ている。git branch <名前> <ハッシュ> でブランチにすれば戻る。見失っても、しばらくは reflog に残っている',
    prevention:
      'detached HEAD でコミットしたら、移動する前に git switch -c <名前> でブランチに乗せる',
    bossWord: '警告は読め。git は、言ってくれてる',
  },
}

const BUTTON = (label: string) => `export function BuyButton() {
  return <button className="buy">${label}</button>
}
`

export const FILES = {
  base: {
    'README.md': '# shop-app\n',
    'src/components/BuyButton.tsx': BUTTON('カートに追加'),
    'src/pages/top.tsx': "import { BuyButton } from '../components/BuyButton'\n",
  },
  later1: {
    'src/pages/top.tsx':
      "import { BuyButton } from '../components/BuyButton'\n// v1.3 の新しいトップ\n",
  },
  later2: { 'src/pages/campaign.tsx': 'export const Campaign = () => null\n' },
  fixed: { 'src/components/BuyButton.tsx': BUTTON('カートに入れる') },
}

export const FIX_MESSAGE = 'fix: 購入ボタンを『カートに入れる』に'
export const FIXED_LABEL = 'カートに入れる'
