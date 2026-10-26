// リポジトリ間のオブジェクトのやりとり（fetch / push / clone の中身）と、コミットの数え方。
import type { GitDir, Oid } from '../model/types.ts'
import { ancestors, readCommit } from '../objects/store.ts'

/** tips から辿れるすべてのオブジェクト（コミット、tree、blob） */
function reachableObjects(git: GitDir, tips: Oid[]): Set<Oid> {
  const out = new Set<Oid>()
  const visitTree = (oid: Oid) => {
    if (out.has(oid)) return
    out.add(oid)
    const tree = git.objects[oid]
    if (tree?.type !== 'tree') return
    for (const e of tree.entries) {
      if (e.mode === '40000') visitTree(e.oid)
      else out.add(e.oid)
    }
  }
  for (const tip of tips) {
    for (const c of ancestors(git, tip)) {
      if (out.has(c)) continue
      out.add(c)
      visitTree(readCommit(git, c).tree)
    }
  }
  return out
}

/** from にあって to にないオブジェクトを to に写す */
export function copyObjects(from: GitDir, to: GitDir, tips: Oid[]): void {
  for (const oid of reachableObjects(from, tips)) {
    if (!(oid in to.objects)) to.objects[oid] = from.objects[oid] as GitDir['objects'][Oid]
  }
}

/** a から辿れて b から辿れないコミット */
export function commitsOnlyIn(git: GitDir, a: Oid, b: Oid | null): Oid[] {
  const exclude = b ? ancestors(git, b) : new Set<Oid>()
  return [...ancestors(git, a)].filter((c) => !exclude.has(c))
}

/** ブランチが上流より何コミット進んでいて、何コミット遅れているか */
export function aheadBehind(
  git: GitDir,
  local: Oid,
  upstream: Oid,
): { ahead: number; behind: number } {
  return {
    ahead: commitsOnlyIn(git, local, upstream).length,
    behind: commitsOnlyIn(git, upstream, local).length,
  }
}
