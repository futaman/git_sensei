// 補助チップ（docs/03 §1.2）。押すと入力欄にコマンドが入るだけで、実行はしない。
import type { FileState, GitDir, RepoView } from '../../../engine/index.ts'

export interface Chip {
  command: string
  /** 入力後にカーソルを末尾から何文字戻すか（git commit -m "" の引用符の中に置くため） */
  cursorBack?: number
}

export interface ChipContext {
  git: GitDir | null
  files: FileState[]
  view: RepoView | null
  /** world にあるサーバー（bare リポジトリ）のパス */
  servers: string[]
  /** いまのフォルダの直下にあるリポジトリ（clone したもの） */
  clonedChildren: string[]
}

export function suggestChips({ git, files, view, servers, clonedChildren }: ChipContext): Chip[] {
  if (!git) {
    // リポジトリの外：clone 済みなら入る、まだならクローンか init
    const chips: Chip[] = clonedChildren.map((dir) => ({ command: `cd ${dir}` }))
    if (chips.length === 0) for (const s of servers) chips.push({ command: `git clone ${s}` })
    chips.push({ command: 'git init' })
    return chips.slice(0, 7)
  }
  if (git.bare) return [{ command: 'cd ~' }]

  // マージの途中：コンフリクトを直して add → commit、またはやめる
  if (git.merge) {
    const conflicted = files.filter((f) => f.worktree === 'conflicted').map((f) => f.path)
    const chips: Chip[] = conflicted.slice(0, 3).map((p) => ({ command: `git add ${p}` }))
    if (conflicted.length === 0) chips.push({ command: 'git commit --no-edit' })
    chips.push({ command: 'git status' }, { command: 'git merge --abort' })
    return chips
  }

  const chips: Chip[] = [{ command: 'git status' }]
  const hasRemote = Object.keys(git.config).some((k) => /^remote\..+\.url$/.test(k))

  const changed = files.filter((f) => f.worktree !== 'clean')
  if (changed.length > 0) {
    chips.push({ command: 'git add .' })
    chips.push({ command: `git add ${(changed[0] as FileState).path}` })
  }
  if (files.some((f) => f.staged !== null))
    chips.push({ command: 'git commit -m ""', cursorBack: 1 })

  if (hasRemote)
    chips.push({ command: 'git pull' }, { command: 'git push' }, { command: 'git fetch' })
  if (view && view.commits.length > 0) {
    chips.push({ command: 'git log --oneline --all' })
    chips.push({ command: 'git switch -c ' })
    for (const b of view.branches) {
      if (b.name !== view.branch) chips.push({ command: `git switch ${b.name}` })
    }
  }
  return chips.slice(0, 9)
}
