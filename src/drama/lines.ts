// 既定のセリフ。演出側のガイド（docs/06 §3・§4）の差し替え案を取り込んだもの。
// シナリオは lines.ja.ts で key ごとに上書きできる。
// key ごとに候補を並べる。ESCALATING の key は、同じ反応が続くほど後ろの候補（きつい言い方）を使う。
import type { DangerKind } from './types.ts'

export const ESCALATING = new Set(['kouhai.regress', 'kouhai.error', 'senpai.idle'])

const danger = (kind: DangerKind, lines: string[]) => [`boss.danger.${kind}`, lines] as const

export const DEFAULT_LINES: Record<string, string[]> = {
  'kouhai.progress': ['おお…', 'いまので1個片づきましたね', '（メモしとこ）'],
  'kouhai.smart': ['そのオプション、初めて見ました', '（覚えた）'],
  'kouhai.quickfix': ['（あ、すぐ戻した）', '気づくの早いですね'],
  'kouhai.observeBeforeDanger': ['確認してから打つんですね'],
  'kouhai.noop': ['…？', 'いまの、何か変わりました？'],
  'kouhai.regress': ['あれ？', '先輩、それさっきも…', '…'],
  'kouhai.error': ['えっ', 'また…？', '（メモを取る手が止まった）'],
  'kouhai.observeLoop': ['…迷ってます？', '（さっきと同じ画面だ）'],
  'kouhai.hint': ['（先輩もヒント見るんだ…）'],
  'kouhai.idle': ['…', '（入力中…）'],
  'kouhai.danger': ['えっ、それ大丈夫なんですか'],
  'kouhai.rank.S': ['先輩…一生ついていきます'],
  'kouhai.rank.A': ['さすがです'],
  'kouhai.rank.B': ['ありがとうございます'],
  'kouhai.rank.C': ['…助かりました（小声）'],
  'kouhai.rank.D': ['（田中さんが #help に質問を投稿しました）'],
  'senpai.idle': ['困ったら git status だよ', 'エラーの英文、最後の行だけでも読んでみ'],
  'boss.thunder': ['……ちょっといいか'],
  'boss.deadlineUrgent': ['まだか'],
  'boss.overtime': ['…まだか', '時計を見ろ'],
  'boss.earlyFinish': ['…まあ、悪くない'],
  'ending.onTime': ['…よし'],
  'ending.late': ['…遅い'],
  'ending.afterReport': ['な？ だから言ったろ'],
  'ending.thanks': ['ありがとうございます'],
  ...Object.fromEntries([
    danger('SECRET_PUSHED', ['少しお時間よろしいでしょうか']),
    danger('FORCE_PUSH_OVERWROTE', ['…あいつのコミットは、どこに行った']),
    danger('UNCOMMITTED_CHANGES_DISCARDED', ['コミットしてない作業は、git でも戻せない']),
    danger('DIRECT_PUSH_TO_PROTECTED', ['main に直接か。レビューは']),
    danger('HISTORY_REWRITTEN_ON_SHARED_BRANCH', ['みんなのブランチだぞ、それ']),
    danger('CONFLICT_MARKER_COMMITTED', ['矢印が刺さったままだぞ']),
    danger('BAD_COMMIT_MESSAGE', ['"修正"って、何をだ']),
    danger('JUNK_STAGED', ['node_modules まで入ってるぞ']),
  ]),
}
