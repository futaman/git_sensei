// 補助チップ（docs/03 §1.2）。押すと入力欄にコマンドが入るだけで、実行はしない。
import type { FileState, RepoView } from '../../../engine/index.ts'

export interface Chip {
  command: string
  /** 入力後にカーソルを末尾から何文字戻すか（git commit -m "" の引用符の中に置くため） */
  cursorBack?: number
}

export function suggestChips(hasRepo: boolean, files: FileState[], view: RepoView | null): Chip[] {
  if (!hasRepo) return [{ command: 'git init' }]
  const chips: Chip[] = [{ command: 'git status' }]

  const changed = files.filter((f) => f.worktree !== 'clean')
  if (changed.length > 0) {
    chips.push({ command: 'git add .' })
    chips.push({ command: `git add ${(changed[0] as FileState).path}` })
  }
  if (files.some((f) => f.staged !== null))
    chips.push({ command: 'git commit -m ""', cursorBack: 1 })

  if (view && view.commits.length > 0) {
    chips.push({ command: 'git log --oneline' })
    chips.push({ command: 'git switch -c ' })
    for (const b of view.branches) {
      if (b.name !== view.branch) chips.push({ command: `git switch ${b.name}` })
    }
  }
  return chips.slice(0, 7)
}
