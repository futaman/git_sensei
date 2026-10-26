// 「先輩の force push」のセリフと始末書（docs/07 の 2-2。演出案のセッションの素材）。
import type { Character } from '../../drama/index.ts'
import type { StageDefinition } from '../stage.ts'

export const NAMES: Record<Character, string> = {
  boss: '黒岩部長',
  kouhai: '田中',
  senpai: '早瀬先輩',
  system: 'その後',
}

export const MISSION = { task: 'origin から消えたクーポンの修正を取り戻す', due: '12:00 昼休み' }

export const SITUATION: StageDefinition['situation'] = [
  'feature/coupon は、早瀬先輩と2人で使っているブランチです。あなたの修正「fix: クーポンの期限切れ判定」は、昨日 push しました。',
  '今朝、早瀬先輩が --force で push しました。手元の origin の記録（origin/feature/coupon）は、まだ fetch していないので古いままです。',
]

export const GOALS = {
  mine: 'origin の feature/coupon に、自分の修正（expire.ts）を戻す',
  senpai: '早瀬先輩の変更（ui.ts）も残す',
  report: '#dev で早瀬先輩に伝える',
}

export const INTRO: StageDefinition['intro'] = [
  { from: 'kouhai', text: '先輩、昨日のクーポンの修正、origin に見当たらないんですけど…' },
  { from: 'senpai', text: '朝ちょっと push 弾かれたから、--force で入れといた。なんかあった？' },
  { from: 'boss', text: '昼までに feature/coupon をレビューに出せ' },
]

export const LINES: Record<string, string[]> = {
  'senpai.idle': [
    'git fetch してから、origin の log を見てみ',
    '手元のと origin の、何が違う？',
    'どっちも残すなら、取り込んでから push だよね',
  ],
  'hint.fetch': ['git fetch。origin の今を、手元に持ってくる'],
  'hint.compare': ['git log origin/feature/coupon。おまえの修正、ある？'],
  'hint.pull': ['git pull --no-rebase で、俺のとおまえのを合わせる'],
  'hint.push': ['マージできたら git push'],
  'hint.report': ['直したら、#dev でひとこと言っとくと、次から起きにくいよ'],
  'hint.lease': [
    'lease は「知らない変更」を守るだけ。fetch した後に打つと、知ってて消すことになる',
  ],
  'senpai.leaseStopped': ['お、lease が止めてくれたね'],
  'kouhai.upToDate': ['え、同じって出てますけど…？'],
  'kouhai.askMerge': ['先輩、マージコミットができてます。これで両方入ったんですか？'],
  'kouhai.observeBeforeDanger': ['確認してから打つんですね'],
  'kouhai.danger': ['…先輩、それ、やり返してません？'],
  'boss.danger.FORCE_PUSH_OVERWROTE': ['force push の応酬をするな'],
  'senpai.overwritten': ['あれ、俺のコミット消えた？'],
  'milestone.fetched': ['あ、origin/feature/coupon が動いた'],
  'ending.A.senpai': ['…助かった。今度おごる'],
  'ending.A.kouhai': ['（直してから言うの、かっこいい）'],
  'ending.B.senpai': ['うわ、ごめん。マジか'],
  'ending.B.senpai2': ['次から気をつける'],
  'ending.C': ['（翌週の月曜、また消えていた）'],
  'ending.D.boss': ['…早瀬、ちょっといいか'],
  'ending.D.senpai': ['…言ってくれるじゃん'],
}

export const CHOICES = [
  {
    id: 'report.fixedAndAdvise',
    text: '消えてたので、マージして戻しておきました。次は --force-with-lease でお願いします',
    trust: 5,
  },
  { id: 'report.fact', text: '先輩の --force で、クーポンの修正が消えてました' },
  { id: 'report.silent', text: '（何も言わない）' },
  { id: 'report.boss', text: '部長に報告します', mood: 5 },
]

export const REPORTS: StageDefinition['reports'] = {
  FORCE_PUSH_OVERWROTE: {
    title: 'force push のやり返しによる、先輩のコミットの消失について',
    what: '自分のコミットを消されたあと、git push --force で origin/feature/coupon を上書きし、早瀬さんのコミット「feat: クーポンの見た目」を消した',
    why: '消されたものを、消し返しても戻らない。消える人が入れ替わるだけ。共有ブランチの force push は、相手の手元とも食い違わせる',
    howToFix:
      '早瀬さんの手元には、まだコミットが残っている。push し直してもらい、自分は pull（マージ）してから push する',
    prevention:
      '取り込んでから push する。上書きが必要なときは --force-with-lease。ただし fetch した後の lease は、知っている変更を消すのを止めない',
    bossWord: 'やられても、やり返すな。取り込め',
  },
}

export const FILES = {
  base: {
    'README.md': '# shop-app\n',
    'src/coupon/index.ts': "export { isExpired } from './expire'\n",
    'src/coupon/expire.ts':
      'export function isExpired(until: Date, now: Date): boolean {\n  return until < now\n}\n',
  },
  b: { 'src/coupon/README.md': '# クーポン\n\n期限と割引を扱う。\n' },
  // あなたの修正：期限の当日いっぱいは使えるようにする
  x: {
    'src/coupon/expire.ts':
      'export function isExpired(until: Date, now: Date): boolean {\n  // 期限の日の終わりまでは使える\n  const end = new Date(until)\n  end.setHours(23, 59, 59, 999)\n  return end < now\n}\n',
  },
  // 早瀬先輩：クーポンの見た目
  c: { 'src/coupon/ui.ts': "export const couponLabel = (rate: number) => rate + '% OFF'\n" },
}

export const MY_MESSAGE = 'fix: クーポンの期限切れ判定'
export const SENPAI_MESSAGE = 'feat: クーポンの見た目'
