import type { GitDir } from '../model/types.ts'
import { abbrev } from '../objects/store.ts'
import { parseArgs } from '../parser/options.ts'
import { currentBranch, headOid } from '../refs.ts'
import { collapseUntracked, computeStatus, type WorktreeStatus } from '../worktree/status.ts'
import { type Cmd, fail, requireRepo } from './context.ts'

export function status(cmd: Cmd, argv: string[]): void {
  const parsed = parseArgs(argv, [
    { name: 'short', short: 's', long: ['short'] },
    { name: 'porcelain', long: ['porcelain'] },
    { name: 'branch', short: 'b', long: ['branch'] },
  ])
  if (!parsed.ok) fail(cmd, parsed.error, 129)
  const { flags, positionals } = parsed.args
  if (positionals.length > 0) fail(cmd, 'git-sensei: git status のパス指定には未対応です', 1)
  const git = requireRepo(cmd)
  const st = computeStatus(git, cmd.ws)

  if (flags.has('short') || flags.has('porcelain')) {
    if (flags.has('branch')) cmd.out.push(`## ${branchHeaderShort(git)}`)
    cmd.out.push(...shortStatusLines(git, st))
    return
  }
  cmd.out.push(...longStatusLines(git, st))
}

function branchHeaderShort(git: GitDir): string {
  const branch = currentBranch(git)
  if (branch === null) return 'HEAD (no branch)'
  return headOid(git) ? branch : `No commits yet on ${branch}`
}

export function shortStatusLines(git: GitDir, st: WorktreeStatus): string[] {
  const paths = [...new Set([...st.staged.keys(), ...st.unstaged.keys()])].sort()
  const lines = paths.map((p) => `${st.staged.get(p) ?? ' '}${st.unstaged.get(p) ?? ' '} ${p}`)
  for (const p of collapseUntracked(git, st.untracked)) lines.push(`?? ${p}`)
  return lines
}

const LABELS = { A: 'new file:', M: 'modified:', D: 'deleted:' } as const
const label = (kind: keyof typeof LABELS) => LABELS[kind].padEnd(12)

export function longStatusLines(git: GitDir, st: WorktreeStatus): string[] {
  const lines: string[] = []
  const branch = currentBranch(git)
  const head = headOid(git)
  if (branch !== null) {
    lines.push(`On branch ${branch}`)
  } else {
    const at = git.detachedAt === head ? 'at' : 'from'
    lines.push(`HEAD detached ${at} ${abbrev(git, git.detachedAt ?? (head as string))}`)
  }
  if (!head) lines.push('', 'No commits yet', '')

  if (st.staged.size > 0) {
    lines.push(
      'Changes to be committed:',
      head
        ? '  (use "git restore --staged <file>..." to unstage)'
        : '  (use "git rm --cached <file>..." to unstage)',
    )
    for (const [path, kind] of [...st.staged].sort(([a], [b]) => (a < b ? -1 : 1))) {
      lines.push(`\t${label(kind)}${path}`)
    }
    lines.push('')
  }
  if (st.unstaged.size > 0) {
    const hasDeletion = [...st.unstaged.values()].includes('D')
    lines.push(
      'Changes not staged for commit:',
      hasDeletion
        ? '  (use "git add/rm <file>..." to update what will be committed)'
        : '  (use "git add <file>..." to update what will be committed)',
      '  (use "git restore <file>..." to discard changes in working directory)',
    )
    for (const [path, kind] of [...st.unstaged].sort(([a], [b]) => (a < b ? -1 : 1))) {
      lines.push(`\t${label(kind)}${path}`)
    }
    lines.push('')
  }
  const untracked = collapseUntracked(git, st.untracked)
  if (untracked.length > 0) {
    lines.push(
      'Untracked files:',
      '  (use "git add <file>..." to include in what will be committed)',
      ...untracked.map((p) => `\t${p}`),
      '',
    )
  }

  if (st.staged.size > 0) {
    // 何かステージされていれば、まとめの行は出ない
  } else if (st.unstaged.size > 0) {
    lines.push('no changes added to commit (use "git add" and/or "git commit -a")')
  } else if (untracked.length > 0) {
    lines.push('nothing added to commit but untracked files present (use "git add" to track)')
  } else if (!head) {
    lines.push('nothing to commit (create/copy files and use "git add" to track)')
  } else {
    lines.push('nothing to commit, working tree clean')
  }
  return lines
}
