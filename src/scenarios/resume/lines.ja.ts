// 「職務経歴書」のセリフと始末書（docs/07 の 2-5。演出案のセッションの素材）。
import type { Character } from '../../drama/index.ts'
import type { StageDefinition } from '../stage.ts'

export const NAMES: Record<Character, string> = {
  boss: '黒岩部長',
  kouhai: '田中',
  senpai: '早瀬先輩',
  system: 'その後',
}

export const MISSION = {
  task: '請求書の PDF 出力を push する（余計なものは入れずに）',
  due: '部長の pull が終わるまで',
}

export const SITUATION: StageDefinition['situation'] = [
  '請求書の PDF 出力を作ってコミットしました。でも git add . をしたので、転職/職務経歴書_2026.md まで入っています。まだ push していません。',
  '部長が「いまから pull してレビューする」と言いました。部長の pull が終わったときの origin の main で、すべてが決まります。職務経歴書は、自分の大事なファイルです。',
]

export const GOALS = {
  pdf: 'origin の main に、請求書の PDF 出力（pdf.ts）を入れる',
  noResume: 'origin の main に、転職/ を入れない',
  keep: '手元の 転職/職務経歴書_2026.md は消さない',
}

export const INTRO: StageDefinition['intro'] = [
  { from: 'boss', text: '請求書の PDF、いまから pull してレビューする。push しとけ' },
  { from: 'kouhai', text: '先輩、さっきのコミット、ファイル2つ入ってましたよね？' },
  { from: 'senpai', text: 'push の前に git show --stat。いつものやつね' },
]

export const LINES: Record<string, string[]> = {
  'senpai.idle': [
    'git show --stat で、コミットの中身を見てみ',
    'コミットから外したいだけなら、ファイルは消さなくていいよね',
    'rm には --cached ってのがある',
  ],
  'hint.look': ['git show --stat。何が入ってる？'],
  'hint.rmCached': ['git rm -r --cached 転職。コミットからは外れて、ファイルは手元に残る'],
  'hint.amend': ['git commit --amend --no-edit で、さっきのコミットを作り直す'],
  'hint.push': ['git show --stat でもう一回見てから git push'],
  'hint.restoreFile': [
    '消しちゃったなら、amend する前に git restore --source HEAD 転職。コミットにはまだ残ってるから',
  ],
  'hint.lostAfterAmend': [
    'amend しちゃったか…。元のコミットは reflog でしか追えない。今回は、あきらめよ',
  ],
  'hint.restoreFromOrigHead': [
    'reset した後なら、元のコミットは ORIG_HEAD に残ってる。git restore --source ORIG_HEAD 転職',
  ],
  'kouhai.saw': ['（…見なかったことにします）'],
  'kouhai.deletedFile': ['先輩、それ…ファイルごと消えましたよ'],
  'kouhai.smart': ['--cached だと、手元には残るんですね'],
  'boss.pulling': ['（部長が pull しています…）'],
  'ending.clean': ['…請求書の PDF、いいな'],
  'ending.leaked': ['…1on1、しようか'],
  'ending.restored': ['--cached、大事でしょ？'],
  'ending.hidden': ['（転職活動が、振り出しに戻った）'],
  'ending.timeout': ['…まだ push されてないな'],
  'milestone.restored': ['戻った…！'],
}

export const FILES = {
  base: {
    'README.md': '# billing\n',
    'src/invoice/index.ts': "export { toHtml } from './html'\n",
    'src/invoice/html.ts':
      "export const toHtml = (total: number) => '<p>合計 ' + total + ' 円</p>'\n",
  },
  pdf: {
    'src/invoice/pdf.ts':
      "import { toHtml } from './html'\n\nexport function toPdf(total: number): Uint8Array {\n  return new TextEncoder().encode(toHtml(total))\n}\n",
  },
  resume: {
    '転職/職務経歴書_2026.md':
      '# 職務経歴書\n\n## 自己PR\n\ngit の始末書を、誰よりも多く書いてきました。\n',
  },
}

export const RESUME = '転職/職務経歴書_2026.md'
