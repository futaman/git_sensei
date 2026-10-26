// HEAD をある tree から別の tree に移すときの、index と作業ツリーの更新（git read-tree -m -u 相当）。
// 手元の変更は、移動先と衝突しない限りそのまま持ち越す。衝突するなら何も変えずに失敗する。

import { own } from '../model/dict.ts'
import type { FilePath, GitDir, IndexEntry, Workspace } from '../model/types.ts'
import { hashBlob } from '../objects/serialize.ts'
import { type FlatTree, readBlob } from '../objects/store.ts'

export type SwitchTreesResult =
  | { ok: true }
  | { ok: false; localChanges: FilePath[]; untracked: FilePath[] }

const same = (a: IndexEntry | undefined, b: IndexEntry | undefined) =>
  a === b || (!!a && !!b && a.oid === b.oid && a.mode === b.mode)

export function switchTrees(
  git: GitDir,
  ws: Workspace,
  from: FlatTree,
  to: FlatTree,
): SwitchTreesResult {
  const localChanges: FilePath[] = []
  const untracked: FilePath[] = []
  const updates: { path: FilePath; entry: IndexEntry | undefined; touchWorktree: boolean }[] = []

  const paths = [...new Set([...Object.keys(from), ...Object.keys(to)])].sort()
  for (const path of paths) {
    const f = own(from, path)
    const t = own(to, path)
    if (same(f, t)) continue
    const i = own(git.index, path)
    const w = own(ws.files, path)

    if (i) {
      if (same(i, t)) {
        // すでに移動先と同じ内容がステージされている
        updates.push({ path, entry: t, touchWorktree: false })
      } else if (same(i, f) && (w === undefined || hashBlob(w) === i.oid)) {
        updates.push({ path, entry: t, touchWorktree: true })
      } else {
        localChanges.push(path)
      }
    } else if (f) {
      // ステージ済みの削除。移動先にもなければ何もしない
      if (t) localChanges.push(path)
    } else if (w !== undefined) {
      untracked.push(path)
    } else {
      updates.push({ path, entry: t, touchWorktree: true })
    }
  }

  if (localChanges.length > 0 || untracked.length > 0) return { ok: false, localChanges, untracked }

  for (const { path, entry, touchWorktree } of updates) {
    if (entry) {
      git.index[path] = { ...entry }
      if (touchWorktree) ws.files[path] = readBlob(git, entry.oid).content
    } else {
      delete git.index[path]
      if (touchWorktree) delete ws.files[path]
    }
  }
  return { ok: true }
}

/** 切り替え後に持ち越された手元の変更（"M\ta.txt" の形。switch の出力に使う） */
export function localChangeLines(git: GitDir, ws: Workspace, head: FlatTree): string[] {
  const lines: string[] = []
  const paths = [...new Set([...Object.keys(head), ...Object.keys(git.index)])].sort()
  for (const path of paths) {
    const h = own(head, path)
    const i = own(git.index, path)
    const w = own(ws.files, path)
    if (!i) {
      if (h) lines.push(`D\t${path}`)
    } else if (w === undefined) {
      lines.push(`D\t${path}`)
    } else if (!h) {
      lines.push(`A\t${path}`)
    } else if (!same(h, i) || hashBlob(w) !== i.oid) {
      lines.push(`M\t${path}`)
    }
  }
  return lines
}

export function switchErrorLines(
  result: Extract<SwitchTreesResult, { ok: false }>,
  action: 'checkout' | 'merge',
): string[] {
  const verb = action === 'checkout' ? 'switch branches' : 'merge'
  const lines: string[] = []
  if (result.localChanges.length > 0) {
    lines.push(
      `error: Your local changes to the following files would be overwritten by ${action}:`,
      ...result.localChanges.map((p) => `\t${p}`),
      `Please commit your changes or stash them before you ${verb}.`,
    )
  }
  if (result.untracked.length > 0) {
    lines.push(
      `error: The following untracked working tree files would be overwritten by ${action}:`,
      ...result.untracked.map((p) => `\t${p}`),
      `Please move or remove them before you ${verb}.`,
    )
  }
  lines.push('Aborting')
  return lines
}
