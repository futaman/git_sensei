// 「月曜9:55、朝会の前に」のセリフ（docs/07 の 1-2。演出案のセッションの素材）。
// ロジックは scenario.ts。文言はここだけ直せばよい。
import type { Character } from '../../drama/index.ts'
import type { StageDefinition } from '../stage.ts'

export const NAMES: Record<Character, string> = {
  boss: '黒岩部長',
  kouhai: '田中',
  senpai: '早瀬先輩',
  system: '朝会',
}

export const MISSION = { task: 'README の誤字を直して main に push する', due: '10:00 朝会' }

export const SITUATION: StageDefinition['situation'] = [
  'README.md のインストール手順に「git clnoe」という誤字があります。リポジトリは clone 済みで、origin と同じ状態です。',
  '10時の朝会で、部長が今週のコミットを画面共有で読み上げます。main への直接 push は、今日はまだ許されています。',
]

export const GOALS = {
  readme: 'origin の main の README.md で、clnoe を clone に直す',
  contributing: 'CONTRIBUTING.md の「コミットメッセージは自由」も直す',
}

export const INTRO: StageDefinition['intro'] = [
  { from: 'boss', text: '10時の朝会で、今週のコミットを読み上げる。README の clnoe、直しておけ' },
  { from: 'kouhai', text: 'clnoe…（打ちそう）' },
  {
    from: 'senpai',
    text: 'エディタで直したら、add → commit → push ね。メッセージは朝会で読まれるよ',
  },
]

export const LINES: Record<string, string[]> = {
  'senpai.idle': [
    'README.md を開いて、clnoe を直してみ',
    'git status で、何が変わったか見えるよ',
    'commit のメッセージ、朝会で読まれるからね',
  ],
  'hint.edit': ['README.md の clnoe を clone に。保存したら git status で確認'],
  'hint.add': ['git add README.md。commit に入れるものを選ぶ'],
  'hint.commit': ['git commit -m "docs: README の clone の綴りを修正" みたいに、何を直したか書く'],
  'hint.push': ['git push。main に出る'],
  'hint.contrib': ['CONTRIBUTING.md の「自由」のところ、何をなぜ変えたか書く、って直してみ'],
  'hint.amend': [
    'まだ push してないなら、git add してから git commit --amend で1つにまとめられるよ',
  ],
  'hint.pushAll': ['あとは git push'],
  'hint.pull': [
    'amend の後は、origin と食い違う。今回は git pull --no-rebase で取り込んでから push しよ',
  ],
  'boss.addMore': [
    'ついでに CONTRIBUTING.md の『コミットメッセージは自由』も直しとけ。自由じゃない',
  ],
  'kouhai.smart': ['amend って、さっきのコミットに足せるんですね'],
  'senpai.afterPushAmend': ['push した後の amend は、履歴が分かれるよ。今回は新しいコミットを足そ'],
  'milestone.committed': ['（コミットした…！）'],
  'boss.danger.BAD_COMMIT_MESSAGE': ['朝会で読むぞ、それ'],
  'boss.danger.HISTORY_REWRITTEN_ON_SHARED_BRANCH': ['朝会の前に、main の履歴を書き換えるな'],
  'ending.readOk': ['"{message}"。…読める。次'],
  'ending.readBad': ['"{message}"。…以上'],
  'ending.readBadKouhai': ['（朝会の空気が止まった）'],
  'ending.contribMissing': ['CONTRIBUTING は'],
  'ending.contribMissingSenpai': ['（あとでいいから、やっとこ）'],
  'ending.lateStandup': ['（朝会が始まった。画面共有に、あなたの push はまだない）'],
  'ending.hidden.boss1': ['…この文、誰が書いた'],
  'ending.hidden.kouhai': ['先輩です！'],
  'ending.hidden.boss2': ['…そうか'],
}

/** ヒントの例文。隠しの結末は、これと違う自分の言葉で書いたとき */
export const EXAMPLE_RULE = 'コミットメッセージには、何をなぜ変えたかを書く'

export const README = `# shop-app

小さなネットショップのサンプルです。

## インストール

\`\`\`
git clnoe https://git.example.com/shop-app.git
cd shop-app
npm install
\`\`\`
`

export const CONTRIBUTING = `# 開発の決まり

- main への push の前に、テストを通す
- コミットメッセージは自由
`
