// 意味イベントを、画面の「できごと」欄に出す日本語にする（フリーモード用の説明。演出のセリフではない）。
import type { GitEvent } from '../../../engine/index.ts'

export type Tone = 'normal' | 'good' | 'warn' | 'danger'

const short = (oid: string) => oid.slice(0, 7)

export function describeEvent(e: GitEvent): { text: string; tone: Tone } {
  switch (e.type) {
    case 'REPO_INITIALIZED':
      return e.reinitialized
        ? { text: 'リポジトリはすでにあります（何も壊れていません）', tone: 'normal' }
        : {
            text: 'リポジトリを作りました。.git フォルダができ、gitが記録を始められます',
            tone: 'good',
          }
    case 'FILES_STAGED':
      return {
        text: `${e.paths.length} 個のファイルの変更をステージしました：${e.paths.join(', ')}`,
        tone: 'normal',
      }
    case 'COMMIT_CREATED':
      return {
        text: e.amend
          ? `直前のコミットを作り直しました（${short(e.oid)}）。前のコミットとは別物になります`
          : `コミット ${short(e.oid)} を作りました${e.branch ? `（${e.branch} が進みました）` : '（どのブランチにも属していません）'}`,
        tone: e.branch ? 'good' : 'warn',
      }
    case 'BRANCH_CREATED':
      return {
        text: `ブランチ ${e.name} を作りました（${short(e.oid)} を指しています）`,
        tone: 'normal',
      }
    case 'BRANCH_DELETED':
      return {
        text: `ブランチ ${e.name} を削除しました${e.force ? '（-D で強制的に）' : ''}`,
        tone: e.force ? 'warn' : 'normal',
      }
    case 'BRANCH_RENAMED':
      return { text: `ブランチ ${e.from} を ${e.to} に名前変更しました`, tone: 'normal' }
    case 'HEAD_MOVED': {
      const where = (p: typeof e.from) => p.branch ?? `${short(p.oid)}（detached）`
      return { text: `HEAD が ${where(e.from)} から ${where(e.to)} に移りました`, tone: 'normal' }
    }
    case 'DETACHED_HEAD_ENTERED':
      return {
        text: 'detached HEAD 状態です。ここで作ったコミットは、ブランチを作らないと迷子になります',
        tone: 'warn',
      }
    case 'COMMITS_ORPHANED':
      return {
        text: `${e.oids.length} 個のコミットが、どのブランチからも辿れなくなりました（グラフから消えます）`,
        tone: 'danger',
      }
    case 'FAST_FORWARDED':
      return {
        text: `${e.branch ?? 'HEAD'} を ${short(e.from)} から ${short(e.to)} へ早送り（fast-forward）しました`,
        tone: 'good',
      }
  }
}
