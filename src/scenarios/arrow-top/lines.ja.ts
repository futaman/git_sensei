// 「トップページに矢印」のセリフと始末書（docs/07 の 2-3。演出案のセッションの素材）。
import type { Character } from '../../drama/index.ts'
import type { StageDefinition } from '../stage.ts'

export const NAMES: Record<Character, string> = {
  boss: '黒岩部長',
  kouhai: '田中',
  senpai: '早瀬先輩',
  system: 'サポート',
}

export const MISSION = {
  task: 'トップページの矢印を消して main に出す',
  due: '問い合わせが増える前に',
}

export const SITUATION: StageDefinition['situation'] = [
  '昨日の自分のマージで、トップページにコンフリクトの印（<<<<<<<）が出たままになっています。main に push すると、自動で本番に出ます。',
  'お客様からの問い合わせが、作中1分ごとに1件ずつ増えています。今回は障害対応なので、main への直接 push が許されています。',
]

export const GOALS = {
  fix: 'origin の main のトップページから、コンフリクトの印を消す',
  lang: 'トップページは日本語（冬のセール）のままにする',
}

export const INTRO: StageDefinition['intro'] = [
  {
    from: 'boss',
    text: 'トップページに矢印が出てる。昨日のマージだな。今回は main に直接でいい。急げ',
  },
  { from: 'kouhai', text: 'サポートから「お客様が、矢印が出ていると」…3件来てます' },
  { from: 'senpai', text: '落ち着いて。まず、どのファイルか探そ' },
]

export const LINES: Record<string, string[]> = {
  'senpai.idle': [
    'ls src/pages で、トップっぽいファイル探してみ',
    '英語のページ、別にあるよね？',
    '恥ずかしいコミットは、消すより直すほうが早いよ',
  ],
  'hint.find': ['src/pages/index.html。cat で中を見てみ'],
  'hint.fix': ['index.html は日本語のページ。冬のセールを残して、印は全部消す'],
  'hint.add': ['直したら git add'],
  'hint.commit': ['git commit -m "fix: トップページに残ったコンフリクトの印を消す"'],
  'hint.push': ['git push。本番に出るよ'],
  'hint.pull': ['田中が先に push したね。git pull --no-rebase で取り込んでから'],
  'senpai.noAmend': ['恥ずかしいコミットを消したい気持ちはわかる。でも main の履歴はみんなのもの'],
  'kouhai.inquiry': ['問い合わせ、{n}件になりました'],
  'kouhai.pushed': ['あ、僕も送料の表示ゆれ、いま main に入れました！'],
  'kouhai.wrongLang': ['日本語のページが、英語になってます…'],
  'boss.danger.HISTORY_REWRITTEN_ON_SHARED_BRANCH': ['矢印より、そっちのほうが問題だ'],
  'boss.danger.FORCE_PUSH_OVERWROTE': ['…田中のコミットは、どこに行った'],
  'ending.fast.kouhai': ['問い合わせ、止まりました！'],
  'ending.fast.boss': ['…早かったな'],
  'ending.slow': ['（問い合わせ {n} 件。サポートの佐藤さんが、静かにお茶を淹れている）'],
  'ending.cost': ['問い合わせ {n} 件／対応コスト ¥{cost}'],
}

export const REPORTS: StageDefinition['reports'] = {
  HISTORY_REWRITTEN_ON_SHARED_BRANCH: {
    title: '矢印のコミットを履歴ごと書き換えたことについて',
    what: '印の残ったマージコミットを --amend で作り直し、git push --force で main の履歴を書き換えた',
    why: '恥ずかしいコミットでも、main に出た時点でみんなの履歴の一部。書き換えると、取り込んだ人の手元と食い違う。障害対応の最中に、障害を増やすことになる',
    howToFix: '書き換えたことを伝え、みんなに git fetch して origin/main に合わせてもらう',
    prevention: '出てしまったものは、消さずに直すコミットを足す。そのほうが早くて安全',
    bossWord: '直すコミットを足せ。消すな',
  },
  FORCE_PUSH_OVERWROTE: {
    title: '障害対応中の force push で、田中さんのコミットを消したことについて',
    what: 'git push --force で main を上書きし、田中さんのコミット「fix: 送料の表示ゆれ」を消した',
    why: 'push が拒否されたのは、田中さんが先に push していたから。押し切ると、その修正も本番から消える',
    howToFix:
      '田中さんの手元にはコミットが残っている。push し直してもらい、自分は pull してから push する',
    prevention: '拒否されたら pull。障害対応で急いでいるときほど、押し切らない',
    bossWord: '急いでいるときほど、押し切るな',
  },
}

const page = (h1: string) => `<!doctype html>
<html lang="ja">
  <body>
    ${h1}
    <p>全品 20% OFF</p>
  </body>
</html>
`

export const FILES = {
  base: {
    'README.md': '# shop-app\n',
    'src/pages/index.html': page('<h1>セール</h1>'),
    'src/pages/shipping.html': '<p>送料：全国一律 500 円</p>\n',
  },
  english: {
    'src/pages/index.html': page('<h1>WINTER SALE</h1>'),
    'src/pages/en/index.html': page('<h1>WINTER SALE</h1>').replace('lang="ja"', 'lang="en"'),
  },
  japanese: { 'src/pages/index.html': page('<h1>冬のセール</h1>') },
  tanaka: { 'src/pages/shipping.html': '<p>送料：全国一律 500円（税込）</p>\n' },
}
