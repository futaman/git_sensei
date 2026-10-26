// 「火曜14:00、今日から main は保護」のセリフ（docs/07 の 1-3。演出案のセッションの素材）。
import type { Character } from '../../drama/index.ts'
import type { StageDefinition } from '../stage.ts'

export const NAMES: Record<Character, string> = {
  boss: '黒岩部長',
  kouhai: '田中',
  senpai: '早瀬先輩',
  system: 'レビュー',
}

export const MISSION = {
  task: 'レシート機能を feature ブランチで push する',
  due: '14:30 レビュー会',
}

export const SITUATION: StageDefinition['situation'] = [
  'レシート機能（src/receipt.ts）を書き終えたところです。まだ commit していません。src/index.ts にも、読み込む1行を足しました。',
  'いまいるのは main です。今日から main への直接 push は禁止になりました。ブランチを切って、レビューに出します。',
]

export const GOALS = {
  branch: 'origin に feature/ で始まるブランチを作る',
  files: 'そのブランチに、receipt.ts と index.ts の変更を入れる',
}

export const INTRO: StageDefinition['intro'] = [
  {
    from: 'boss',
    text: '今日から main は保護する。直接 push するな。ブランチを切って、レビューに出せ',
  },
  { from: 'senpai', text: 'ブランチ名は feature/ から始めてね。feature/receipt とか' },
  { from: 'kouhai', text: '先輩、もう main で書いちゃってません…？' },
]

export const LINES: Record<string, string[]> = {
  'senpai.idle': [
    'git status。いま、どのブランチにいる？',
    'まだ commit してない変更は、ブランチを切っても一緒についてくるよ',
    'git switch -c で、作って移るのが一発でできる',
  ],
  'hint.branch': ['git switch -c feature/receipt。変更はそのまま持っていける'],
  'hint.add': ['git add で2つとも選ぶ。git status で確認しながらね'],
  'hint.commit': ['git commit -m "feat: レシートを発行できるようにする" みたいに'],
  'hint.push': [
    '初めての push は git push -u origin feature/receipt。-u で次から git push だけで済む',
  ],
  'hint.rescue': [
    'main で commit しちゃったなら、push する前に git switch -c feature/receipt。コミットごと移れるよ',
  ],
  'kouhai.smart': ['作って移るの、1回でできるんですね'],
  'kouhai.noUpstream': ['（エラーの中に、打つべきコマンドが書いてある…）'],
  'boss.moveUp': ['レビュー会、14:20 からにする'],
  'boss.danger.DIRECT_PUSH_TO_PROTECTED': ['main に直接か。レビューは'],
  'senpai.rescued': ['ローカルの main が1個進んだままだけど、それは reset を覚えたら直そ'],
  'ending.review': ['…ブランチ名がいい'],
  'ending.reviewCard': ['レビュー依頼：{branch} → main'],
  'ending.directPush': ['レビュー会で見るものが、もう main に入ってるな'],
  'ending.noError': ['先輩、1回もエラー出してない…'],
}

export const FILES = {
  index: "export { total } from './cart'\n",
  indexWithReceipt: "export { total } from './cart'\nexport { printReceipt } from './receipt'\n",
  receipt: `import type { Item } from './cart'
import { total } from './cart'

export function printReceipt(items: Item[]): string {
  const lines = items.map((i) => \`\${i.name}  ¥\${i.price}\`)
  return [...lines, '----', \`合計  ¥\${total(items)}\`].join('\\n')
}
`,
  cart: `export interface Item {
  name: string
  price: number
}

export function total(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0)
}
`,
}
