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
        text:
          e.from === null
            ? `${e.branch ?? 'HEAD'} にリモートの内容 ${short(e.to)} を取り込みました`
            : `${e.branch ?? 'HEAD'} を ${short(e.from)} から ${short(e.to)} へ早送り（fast-forward）しました`,
        tone: 'good',
      }
    case 'CLONED':
      return {
        text: e.empty
          ? `${e.url} をクローンしました（まだ空のリポジトリです）`
          : `${e.url} をクローンしました。${e.path} にコピーができ、origin として登録されました`,
        tone: 'good',
      }
    case 'REMOTE_ADDED':
      return { text: `リモート ${e.name}（${e.url}）を登録しました`, tone: 'normal' }
    case 'REMOTE_REMOVED':
      return { text: `リモート ${e.name} の登録を外しました`, tone: 'normal' }
    case 'UPSTREAM_SET':
      return {
        text: `${e.branch} の上流を ${e.upstream} にしました（pull / push の相手）`,
        tone: 'normal',
      }
    case 'FETCHED':
      return {
        text: `${e.remote} の最新を取ってきました：${e.updates
          .map((u) =>
            u.to === null
              ? `${e.remote}/${u.branch} を削除`
              : `${e.remote}/${u.branch}${u.forced ? '（履歴が書き換えられています！）' : ''}`,
          )
          .join(', ')}`,
        tone: e.updates.some((u) => u.forced) ? 'warn' : 'normal',
      }
    case 'PUSHED':
      return {
        text: `${e.remote} に push しました：${e.updates
          .map((u) =>
            u.to === null
              ? `${u.branch} を削除`
              : u.from === null
                ? `${u.branch}（新しいブランチ）`
                : `${u.branch}${u.forced ? '（強制上書き）' : ''}`,
          )
          .join(', ')}`,
        tone: e.updates.some((u) => u.forced || u.to === null) ? 'warn' : 'good',
      }
    case 'PUSH_REJECTED':
      return {
        text:
          e.reason === 'fetch-first' || e.reason === 'non-fast-forward'
            ? `${e.remote}/${e.branch} への push が拒否されました。リモートに、手元にないコミットがあります（先に pull）`
            : e.reason === 'stale-info'
              ? `--force-with-lease が push を止めました。最後に fetch した後で、${e.branch} が誰かに更新されています`
              : `${e.branch} は相手のリポジトリで使用中なので push できません`,
        tone: 'warn',
      }
    case 'FORCE_PUSH_OVERWROTE':
      return {
        text: `force push で ${e.remote}/${e.branch} のコミット ${e.lostCommits.length} 個を消しました（${e.authors.join('、')} のコミット）`,
        tone: 'danger',
      }
    case 'PULL_DIVERGED':
      return {
        text: `${e.branch} と ${e.upstream} が分岐しています。取り込み方（merge / rebase）を選ぶ必要があります`,
        tone: 'warn',
      }
  }
}
