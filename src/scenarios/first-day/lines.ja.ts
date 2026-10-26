// 「入社初日、犯人は log の中」のセリフ（docs/07 の 1-1。演出案のセッションの素材）。
import type { Character } from '../../drama/index.ts'
import type { StageDefinition } from '../stage.ts'

export const NAMES: Record<Character, string> = {
  boss: '黒岩部長',
  kouhai: '田中',
  senpai: '早瀬先輩',
  system: 'お知らせ',
}

export const MISSION = { task: '昨日 main を壊したコミットを見つけて報告する', due: '10:30' }

export const SITUATION: StageDefinition['situation'] = [
  '入社初日です。チームのリポジトリ shop-app は、まだ手元にありません。',
  '昨夜から、トップページの合計金額が NaN になっています。どのコミットで壊れたのかを調べて、#dev で報告します。',
]

export const GOALS = {
  clone: 'リポジトリを clone して、中に入る',
  answer: '壊したコミットを #dev で報告する',
}

export const INTRO: StageDefinition['intro'] = [
  {
    from: 'boss',
    text: '初日で悪いが、トップの合計が NaN になってる。どのコミットからか調べて、ここに書け',
  },
  { from: 'kouhai', text: '昨日の18時に見たときは、ちゃんと動いてました！' },
  {
    from: 'senpai',
    text: 'リポジトリは git clone https://git.example.com/shop-app.git ね。見るだけのコマンドは何回打ってもタダだよ',
  },
]

export const LINES: Record<string, string[]> = {
  'senpai.idle': [
    'clone したら、cd shop-app で中に入ってみ',
    'git log で、誰がいつ何をしたか全部見えるよ',
    '田中は「18時には動いてた」って言ってたよね',
  ],
  'hint.clone': ['チャットの URL を git clone に渡す。リポジトリが丸ごと手元に来るよ'],
  'hint.cd': ['clone したら shop-app ってフォルダができてる。cd shop-app'],
  'hint.log': ['git log。Author と Date をよく見てみ'],
  'hint.answer': ['18時より後のコミットは2つ。README だけのほうは、合計を壊せないよね'],
  'milestone.cloned': ['わ、全部来ました'],
  'milestone.sawLog': ['（コミットが5個…）'],
  'kouhai.observeLoop': ['…迷ってます？', '（さっきと同じ画面だ）'],
  'kouhai.oneline': ['（--oneline だと、誰が書いたか見えないんだ）'],
  'answer.wrong.kouhai': ['えっ、僕ですか…'],
  'answer.wrong.kouhai.boss': ['…ちがう'],
  'answer.wrong.senpai': ['README で合計は壊れないって'],
  'answer.wrong.old': ['それは3日前のだよ。田中が昨日の18時に見たときは、動いてたんでしょ？'],
  'answer.dontKnow': ['わからないと言えるのは悪くない'],
  'answer.dontKnow.senpai': ['時刻を見てみ。18時には動いてたんでしょ？'],
  'ending.bossConfess': ['…俺だ。よく見てるな'],
  'ending.kouhaiWhisper': ['（部長も「とりあえず」って書くんだ…）'],
  'ending.welcome': ['ようこそ、うちのチームへ'],
}

export const CHOICES = [
  { id: 'answer.d4', text: '「とりあえず」のコミットです', mood: 5 },
  { id: 'answer.c3', text: '「料金改定：手数料率を3.6%に」のコミットです', trust: -10 },
  { id: 'answer.e5', text: '「docs: README を更新」のコミットです' },
  { id: 'answer.b2', text: '「feat: カートに合計金額を表示」のコミットです' },
  { id: 'answer.unknown', text: 'わかりません', mood: 5 },
]

const CART = `export interface Item {
  name: string
  price: number
}

export function total(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0)
}
`

export const FILES = {
  init: {
    'README.md': '# shop-app\n\nネットショップのサンプルです。\n',
    'package.json': '{\n  "name": "shop-app",\n  "private": true\n}\n',
  },
  cart: { 'src/cart.ts': CART },
  calc: {
    'src/payment/calc.ts':
      'export function calcFee(amount: number): number {\n  const rate = 0.036 // 2026/11 料金改定\n  return Math.floor(amount * rate)\n}\n',
  },
  // 初期値の 0 を消してしまった（最初の要素がオブジェクトのまま足されて NaN になる）
  broken: { 'src/cart.ts': CART.replace('sum + item.price, 0)', 'sum + item.price)') },
  readme: {
    'README.md':
      '# shop-app\n\nネットショップのサンプルです。\n\n## 動かし方\n\nnpm install して npm run dev。\n',
  },
}
