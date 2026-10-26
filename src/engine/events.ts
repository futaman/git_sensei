// 演出エンジンに渡す意味イベント（docs/02 §3.1）。
// エンジンは演出のことを知らない。「何が起きたか」だけを事実として伝える。
import type { Oid } from './model/types.ts'

export type HeadPosition = { branch: string; oid: Oid | null } | { branch: null; oid: Oid }

/** リモートのブランチ（またはリモート追跡ブランチ）がどう変わったか */
export interface RefUpdate {
  branch: string
  from: Oid | null
  to: Oid | null
  /** 早送りではない更新（履歴が書き換わった） */
  forced: boolean
}

export type PushRejectReason = 'fetch-first' | 'non-fast-forward' | 'stale-info' | 'checked-out'

export type GitEvent =
  | { type: 'REPO_INITIALIZED'; reinitialized: boolean }
  | { type: 'FILES_STAGED'; paths: string[] }
  | { type: 'COMMIT_CREATED'; oid: Oid; parents: Oid[]; branch: string | null; amend: boolean }
  | { type: 'BRANCH_CREATED'; name: string; oid: Oid }
  | { type: 'BRANCH_DELETED'; name: string; oid: Oid; force: boolean }
  | { type: 'BRANCH_RENAMED'; from: string; to: string }
  | { type: 'HEAD_MOVED'; from: HeadPosition; to: HeadPosition }
  | { type: 'DETACHED_HEAD_ENTERED'; oid: Oid }
  /** detached HEAD から離れて、どのブランチからも辿れなくなったコミット */
  | { type: 'COMMITS_ORPHANED'; oids: Oid[] }
  | { type: 'FAST_FORWARDED'; branch: string | null; from: Oid | null; to: Oid }
  | { type: 'CLONED'; url: string; path: string; branch: string | null; empty: boolean }
  | { type: 'REMOTE_ADDED'; name: string; url: string }
  | { type: 'REMOTE_REMOVED'; name: string }
  | { type: 'UPSTREAM_SET'; branch: string; upstream: string }
  /** リモート追跡ブランチ（origin/main など）が更新された */
  | { type: 'FETCHED'; remote: string; updates: RefUpdate[] }
  /** リモートのブランチを書き換えた */
  | { type: 'PUSHED'; remote: string; updates: RefUpdate[] }
  | { type: 'PUSH_REJECTED'; remote: string; branch: string; reason: PushRejectReason }
  /** force push で、リモートにあったコミットが消えた（誰のコミットだったかも伝える） */
  | {
      type: 'FORCE_PUSH_OVERWROTE'
      remote: string
      branch: string
      lostCommits: Oid[]
      authors: string[]
    }
  /** pull で上流と分岐していて、取り込み方を決めないと進めない */
  | { type: 'PULL_DIVERGED'; branch: string; upstream: string }
