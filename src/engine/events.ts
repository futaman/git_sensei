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
  /** ステージから降ろした（git restore --staged、git reset <file> など） */
  | { type: 'FILES_UNSTAGED'; paths: string[] }
  /**
   * まだコミットしていない変更を、作業ツリーから消した（checkout -- / restore / reset --hard）。
   * 消えたのは、どのコミットにも残っていない内容。bulk はまとめて消す操作（reset --hard、'.' の指定）
   */
  | { type: 'CHANGES_DISCARDED'; paths: string[]; bulk: boolean }
  /** git reset でブランチ（または detached HEAD）を動かした */
  | {
      type: 'RESET'
      mode: 'soft' | 'mixed' | 'hard'
      branch: string | null
      from: Oid | null
      to: Oid
    }
  /** git rm。cached なら作業ツリーのファイルは残る */
  | { type: 'FILES_REMOVED'; paths: string[]; cached: boolean }
  /** git mv */
  | { type: 'FILE_MOVED'; from: string; to: string }
  /** rm -rf .git でリポジトリ（履歴）ごと消した。作業ツリーのファイルは残る */
  | { type: 'REPO_DELETED'; path: string }
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
  /** マージコミットを作った（コンフリクトなし） */
  | { type: 'MERGED'; branch: string | null; from: string; oid: Oid }
  /** マージがコンフリクトで止まった */
  | {
      type: 'MERGE_CONFLICT'
      branch: string | null
      from: string
      files: { path: string; kind: 'content' | 'add/add' | 'modify/delete' }[]
    }
  /** git add でコンフリクトを解消した。remaining は残りのファイル数 */
  | { type: 'CONFLICT_RESOLVED'; path: string; remaining: number }
  | { type: 'MERGE_ABORTED' }
