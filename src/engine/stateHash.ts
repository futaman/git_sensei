// 「意味のある状態」のハッシュ（docs/04 §2.2）。演出エンジンが後退・空振りを判定するのに使う。
// 含める：全リポジトリの HEAD、refs、index（コンフリクト中の stage も）、マージの途中か、作業ツリー
// 除く：オブジェクトの保存領域（増える一方で、戻ったことにならない）、設定、reflog、時計
import { sha1 } from '@noble/hashes/legacy.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import type { World } from './model/types.ts'

/** キーを並べ替えて JSON にする（同じ状態なら必ず同じ文字列になる） */
function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`
}

export function stateHash(world: World): string {
  const summary = Object.fromEntries(
    Object.values(world.workspaces).map((ws) => [
      ws.path,
      {
        files: ws.files,
        git: ws.git && {
          head: ws.git.head,
          refs: ws.git.refs,
          symrefs: ws.git.symrefs,
          index: ws.git.index,
          unmerged: ws.git.unmerged,
          merging: ws.git.merge?.head ?? null,
        },
      },
    ]),
  )
  return bytesToHex(sha1(utf8ToBytes(stable(summary))))
}
