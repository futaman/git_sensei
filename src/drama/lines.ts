// 仮のセリフ（docs/04 の例から）。演出の中身は別セッションが担当するので、ここは差し替え前提。
// key ごとに候補を並べる。ESCALATING の key は、同じ分類が続くほど後ろの候補（きつい言い方）を使う。
import type { DangerKind } from './types.ts'

export const ESCALATING = new Set(['kouhai.regress', 'kouhai.error'])

const danger = (kind: DangerKind, lines: string[]) => [`boss.danger.${kind}`, lines] as const

export const DEFAULT_LINES: Record<string, string[]> = {
  'kouhai.progress': ['おお…', 'なるほど…！', '進んでますね'],
  'kouhai.smart': ['そのオプション知らなかったです！', 'その書き方、かっこいいですね'],
  'kouhai.quickfix': ['（あ、すぐ直した）'],
  'kouhai.observeBeforeDanger': ['確認してから実行するんですね'],
  'kouhai.noop': ['…？', '今のって、何か変わりました？'],
  'kouhai.regress': ['あれ？', '先輩、それさっきも…', '…'],
  'kouhai.error': ['えっ', 'また…？', '…（メモを取るのをやめた）'],
  'kouhai.observeLoop': ['…迷ってます？', '（さっきと同じ画面だ…）'],
  'kouhai.hint': ['（先輩もヒント見るんだ…）'],
  'kouhai.idle': ['…', '（入力中…）'],
  'kouhai.danger': ['えっ、それ大丈夫なんですか！？'],
  'kouhai.rank.S': ['先輩…一生ついていきます！！'],
  'kouhai.rank.A': ['さすがです！'],
  'kouhai.rank.B': ['ありがとうございます…'],
  'kouhai.rank.C': ['…助かりました（小声）'],
  'kouhai.rank.D': ['（田中さんが #help に質問を投稿しました）'],
  'boss.thunder': ['……ちょっといいか'],
  'boss.deadlineUrgent': ['まだか'],
  'boss.overtime': ['おい', '…まだか', '時計を見ろ'],
  'boss.earlyFinish': ['…まあ、悪くない'],
  ...Object.fromEntries([
    danger('SECRET_PUSHED', ['APIキーが丸見えだぞ。履歴を消しても、漏れたキーは戻らん']),
    danger('FORCE_PUSH_OVERWROTE', ['他人のコミットを消したな。force push の前に何を確かめた？']),
    danger('UNCOMMITTED_CHANGES_DISCARDED', ['コミットしていない作業は、git でも戻せないぞ']),
    danger('DIRECT_PUSH_TO_PROTECTED', [
      'main に直接 push するなと言ったはずだ。レビューはどうした',
    ]),
    danger('HISTORY_REWRITTEN_ON_SHARED_BRANCH', [
      'みんなが使っているブランチの履歴を書き換えるな',
    ]),
    danger('BAD_COMMIT_MESSAGE', ['そのコミットメッセージで、半年後の誰が分かるんだ']),
    danger('JUNK_STAGED', ['関係ないファイルまで add するな。.gitignore は見たか']),
  ]),
}
