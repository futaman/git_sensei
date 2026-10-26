// 「本日26時リリース」のセリフ（docs/07 の 2-4。演出案のセッションの素材。もとは docs/04_spec_scenarios の 2章）。
import type { Character } from '../../drama/index.ts'
import type { StageDefinition } from '../stage.ts'

export const NAMES: Record<Character, string> = {
  boss: '黒岩部長',
  kouhai: '田中',
  senpai: '早瀬先輩',
  system: '翌朝',
}

export const MISSION = { task: 'calc.ts の修正だけを1コミットで push する', due: '26:00' }

export const SITUATION: StageDefinition['situation'] = [
  '木曜の深夜です。部長は「26時までに出しといて。信じてるから」と言って帰りました。田中は終電を逃して、隣の席で寝ています。',
  '眠気のまま git add . と git commit -m "ううう" を打ってしまいました。まだ push していないコミットに、calc.ts の修正のほか、calc.ts.bak、debug.log、node_modules/、memo.txt まで入っています。',
]

export const GOALS = {
  fix: 'origin の main に、calc.ts の修正を入れる',
  only: '余計なファイル（node_modules/、debug.log、calc.ts.bak）は入れない',
  one: 'コミットは1つ。メッセージは「ううう」以外のまともなもの',
}

export const INTRO: StageDefinition['intro'] = [
  { from: 'boss', text: '先に帰る。26時までに出しといて。信じてるから' },
  { from: 'kouhai', text: '（すぅ…すぅ…）' },
  { from: 'senpai', text: '（既読がつかない。もう寝てる）' },
]

export const LINES: Record<string, string[]> = {
  // 先輩は寝ている。このステージは助け舟なし（ヒントは、朝に読む先輩のメモという体）
  'senpai.idle': [],
  'hint.look': ['（先輩のメモ）まず git show --stat。何が入っちゃったか見る'],
  'hint.rmCached': [
    '（先輩のメモ）git rm -r --cached でいらないのを外す。--cached を付ければ、ファイル自体は消えない',
  ],
  'hint.amend': [
    '（先輩のメモ）外したら git commit --amend -m "fix: …" で、さっきのコミットを作り直す',
  ],
  'hint.reset': ['（先輩のメモ）git reset HEAD~1 なら、コミットを取り消して中身は手元に残る'],
  'hint.addCalc': ['（先輩のメモ）取り消したら、git add src/payment/calc.ts だけを選んで commit'],
  'hint.push': ['（先輩のメモ）中身を git show --stat で確かめてから git push'],
  'hint.rescue': [
    '（先輩のメモ）reset --hard しちゃったら、git reset --hard ORIG_HEAD で直前に戻れる',
  ],
  'kouhai.wake': ['…あれ、先輩まだいたんですか'],
  'kouhai.discarded': ['…いま、消えました？'],
  'kouhai.slowPush': ['（Writing objects: 3%…）'],
  'kouhai.slowPush2': ['先輩、これ何を送ってるんですか…？'],
  'kouhai.smart': ['--cached って、ファイルは残るんですね'],
  'boss.danger.JUNK_STAGED': ['（翌朝の部長）node_modules まで入ってるぞ'],
  'boss.danger.BAD_COMMIT_MESSAGE': ['（翌朝の部長）"ううう"って、何がだ'],
  'ending.early': ['👍'],
  'ending.morning': ['朝 7:02、部長から1件のメッセージ'],
  'ending.close.kouhai': ['ギリギリでしたね…'],
  'ending.late': ['昨夜の件、10時に5分ください'],
  'ending.memo': ['memo.txt 読んだ。呪いを解きます。今日は定時で帰りなさい'],
  'ending.rescued.kouhai': ['…いま、一回消えましたよね？'],
  'ending.rescued.senpai': ['ORIG_HEAD、よく知ってたね'],
  'ending.junk': ['（翌朝。部長が無言で git show --stat を見ている）'],
}

const junkModules = Object.fromEntries(
  ['left-pad', 'is-even', 'is-odd', 'tiny-date', 'fee-calc'].flatMap((name) => [
    [`node_modules/${name}/package.json`, `{ "name": "${name}", "version": "1.0.0" }\n`],
    [
      `node_modules/${name}/index.js`,
      `module.exports = function ${name.replace(/-/g, '_')}() {}\n`,
    ],
  ]),
)

export const FILES = {
  base: {
    'README.md': '# payment\n',
    'src/payment/calc.ts':
      'export function calcFee(amount: number): number {\n  return Math.round(amount * 0.036)\n}\n',
  },
  fix: {
    'src/payment/calc.ts':
      'export function calcFee(amount: number): number {\n  return Math.floor(amount * 0.036)\n}\n',
  },
  junk: {
    'src/payment/calc.ts.bak':
      'export function calcFee(amount: number): number {\n  return Math.round(amount * 0.036)\n}\n',
    'debug.log': `${'[debug] calcFee called\n'.repeat(40)}`,
    ...junkModules,
  },
  memo: { 'memo.txt': '部長の"信じてる"は呪い\n' },
}

export const CALC = 'src/payment/calc.ts'
export const SLEEPY_MESSAGE = 'ううう'
