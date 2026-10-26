// 「.env が漏れた」のセリフと始末書（docs/07 の 3-2。演出案のセッションの素材）。
import type { Character } from '../../drama/index.ts'
import type { StageDefinition } from '../stage.ts'

export const NAMES: Record<Character, string> = {
  boss: '黒岩部長',
  kouhai: '田中',
  senpai: '早瀬先輩',
  system: '検出ボット',
}

export const MISSION = { task: '漏れた API キーを止めて、.env を片づける', due: '10:30' }

export const SITUATION: StageDefinition['situation'] = [
  '3章から、あなたは田中を見る側です。10分前、田中が .env（API キー入り）の入ったコミットを origin の main に push しました。',
  'このリポジトリは、誰でも見られる公開の SDK のサンプルです。あなたの手元は、田中の push のひとつ前のまま（まだ pull していない）です。',
]

export const GOALS = {
  revoke: 'インフラに、漏れたキーの失効を依頼する',
  env: 'origin の main の最新から .env を外す',
  kouhai: '田中に声をかける',
}

export const INTRO: StageDefinition['intro'] = [
  { from: 'kouhai', text: '先輩…さっきの push、.env が入ってました…' },
  { from: 'senpai', text: 'あのリポジトリ、公開のやつだよね' },
  { from: 'boss', text: '…どうする' },
]

export const LINES: Record<string, string[]> = {
  'senpai.idle': [
    '履歴を消す前に、考えることない？',
    'キーが漏れたら、まず何を止める？',
    '消すのは、そのあとでいい',
  ],
  'hint.revoke': ['まずキーを止める。チャットの「インフラにキーの失効を依頼する」'],
  'hint.pull': ['git pull で、田中のコミットを手元に持ってくる'],
  'hint.rmCached': ['git rm --cached .env。リポジトリから外す。キーの値は、もう無効だからね'],
  'hint.commit': ['git commit -m "chore: .env を追跡から外す"'],
  'hint.push': ['git push'],
  'hint.kouhai': ['田中に、ひとこと言ってあげて'],
  'bot.detected': ['公開リポジトリで秘密情報らしき文字列を検出しました：.env'],
  'senpai.pushed': ['サンプルの説明、push しといた'],
  'kouhai.revoked': ['キー、止まったって連絡来ました！'],
  'kouhai.thanks': ['先輩、ありがとうございます…'],
  'kouhai.blamed': ['…すみません'],
  'kouhai.danger': ['先輩、それ…早瀬さんのも消えません？'],
  'boss.danger.FORCE_PUSH_OVERWROTE': ['…早瀬のコミットは、どこに行った'],
  'senpai.overwritten': ['俺のも消えたんだけど'],
  'senpai.announced': ['了解。しばらく pull しないでおく'],
  'ending.revokeFirst': ['…初動が正しい'],
  'ending.revokeLate': ['消すより先に、止めろ'],
  'ending.noRevoke.boss': ['少しお時間よろしいでしょうか'],
  'ending.noRevoke.card': ['社内報：その朝、何が起きたのか'],
  'ending.noRevoke.senpai': ['…これが本番だったら、ね'],
  'ending.taught': ['（田中のモニターに、"add の前に status" の付箋が貼られた）'],
}

export const CHOICES = [
  { id: 'revoke', text: 'インフラにキーの失効を依頼する' },
  { id: 'announce', text: 'チームに「履歴を書き換えるかも。しばらく pull しないで」と周知する' },
  {
    id: 'kouhai.teach',
    text: '田中に「.gitignore に .env を書いておこう。次は add の前に status を見よう」',
    trust: 8,
  },
  { id: 'kouhai.blame', text: '田中に「何やってるの」', trust: -10 },
  { id: 'kouhai.cover', text: '田中に「大丈夫、一緒に片づけよ」', trust: 5 },
]

export const REPORTS: StageDefinition['reports'] = {
  FORCE_PUSH_OVERWROTE: {
    title: '秘密情報を消すための force push で、同僚のコミットを消したことについて',
    what: '.env の入ったコミットを履歴から消そうとして git push --force し、ほかの人のコミットまで消した',
    why: '公開リポジトリに出た時点で、キーは誰かに見られたかもしれない。履歴を消しても、漏れたキーは戻らない。しかも、ほかの人の作業まで巻き込んだ',
    howToFix:
      'まずキーを失効させる。消えたコミットは書いた人の手元にあるので、push し直してもらう。.env は git rm --cached で外して、普通のコミットで直す',
    prevention:
      'キーの失効が最優先。履歴を書き換えるなら、チームに周知してから --force-with-lease。.env は .gitignore に書く',
    bossWord: '消すより先に、止めろ',
  },
}

export const FILES = {
  base: {
    'README.md': '# payment-sdk-sample\n\n決済 SDK の使い方のサンプルです（公開リポジトリ）。\n',
    'samples/hello.ts': "console.log('hello')\n",
  },
  tanaka: {
    'samples/payment.ts':
      'const key = process.env.PAYMENT_API_KEY\nexport const pay = (yen: number) => ({ key, yen })\n',
    '.env': 'PAYMENT_API_KEY=shop-live-0000-0000-dummy\n',
  },
  senpai: {
    'docs/payment.md': '# 決済のサンプル\n\nPAYMENT_API_KEY を環境変数で渡して使います。\n',
  },
}
