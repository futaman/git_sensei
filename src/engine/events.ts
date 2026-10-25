// 演出エンジンに渡す意味イベント（docs/02 §3.1）。
// エンジンは演出のことを知らない。「何が起きたか」だけを事実として伝える。
import type { Oid } from './model/types.ts'

export type HeadPosition = { branch: string; oid: Oid | null } | { branch: null; oid: Oid }

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
  | { type: 'FAST_FORWARDED'; branch: string | null; from: Oid; to: Oid }
