// ファイル単位の3-wayマージ（git の ort 戦略の基本部分）と、マージベースの計算。
// 名前の変更（rename）の検出やディレクトリとファイルの衝突は扱わない。
import { dict, own } from '../model/dict.ts'
import type { FilePath, GitDir, IndexEntry, Oid, UnmergedEntry } from '../model/types.ts'
import { ancestors, type FlatTree, readBlob, writeObject } from '../objects/store.ts'
import { mergeText } from './lineMerge.ts'

/** 共通の祖先のうち、ほかの共通の祖先の祖先ではないもの（最良のマージベース） */
export function mergeBases(git: GitDir, a: Oid, b: Oid): Oid[] {
  const ofA = ancestors(git, a)
  const common = [...ancestors(git, b)].filter((c) => ofA.has(c))
  return common.filter((c) => !common.some((d) => d !== c && ancestors(git, d).has(c)))
}

export type ConflictKind = 'content' | 'add/add' | 'modify/delete'

export interface TreeConflict {
  path: FilePath
  kind: ConflictKind
  stages: UnmergedEntry
  /** 作業ツリーに書く内容（コンフリクトの印つき）。null なら書かない */
  worktree: string | null
}

export interface TreeMergeResult {
  /** きれいにマージできたファイル（stage 0 に入る） */
  clean: FlatTree
  conflicts: TreeConflict[]
  /** "Auto-merging a.txt" / "CONFLICT (content): ..." の行（パス順） */
  messages: string[]
}

const same = (a: IndexEntry | undefined, b: IndexEntry | undefined) =>
  a === b || (!!a && !!b && a.oid === b.oid && a.mode === b.mode)

const text = (git: GitDir, e: IndexEntry | undefined) => (e ? readBlob(git, e.oid).content : '')

export function mergeTrees(
  git: GitDir,
  base: FlatTree,
  ours: FlatTree,
  theirs: FlatTree,
  labels: { ours: string; theirs: string },
): TreeMergeResult {
  const clean: FlatTree = dict()
  const conflicts: TreeConflict[] = []
  const messages: string[] = []
  const paths = [
    ...new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)]),
  ].sort()

  for (const path of paths) {
    const b = own(base, path)
    const o = own(ours, path)
    const t = own(theirs, path)
    let result: IndexEntry | undefined
    if (same(o, t)) result = o
    else if (same(o, b)) result = t
    else if (same(t, b)) result = o
    else if (o && t) {
      // 両方が変えた（または両方が追加した）：行単位でマージする
      messages.push(`Auto-merging ${path}`)
      const merged = mergeText(text(git, b), text(git, o), text(git, t), labels)
      if (merged.conflicts === 0) {
        result = { oid: writeObject(git, { type: 'blob', content: merged.text }), mode: o.mode }
      } else {
        const kind = b ? 'content' : 'add/add'
        messages.push(`CONFLICT (${kind}): Merge conflict in ${path}`)
        conflicts.push({
          path,
          kind,
          stages: { ...(b ? { base: b } : {}), ours: o, theirs: t },
          worktree: merged.text,
        })
        continue
      }
    } else {
      // 片方が削除し、もう片方が変更した
      const survivor = (o ?? t) as IndexEntry
      const [deletedIn, modifiedIn] = o
        ? [labels.theirs, labels.ours]
        : [labels.ours, labels.theirs]
      messages.push(
        `CONFLICT (modify/delete): ${path} deleted in ${deletedIn} and modified in ${modifiedIn}.  Version ${modifiedIn} of ${path} left in tree.`,
      )
      conflicts.push({
        path,
        kind: 'modify/delete',
        stages: { ...(b ? { base: b } : {}), ...(o ? { ours: o } : { theirs: survivor }) },
        worktree: text(git, survivor),
      })
      continue
    }
    if (result) clean[path] = result
  }
  return { clean, conflicts, messages }
}
