import { own } from '../model/dict.ts'
import type { GitDir } from '../model/types.ts'
import { abbrev } from '../objects/store.ts'
import { parseArgs } from '../parser/options.ts'
import { currentBranch, headOid, upstreamOf } from '../refs.ts'
import { aheadBehind } from '../remote/transfer.ts'
import {
  collapseUntracked,
  computeStatus,
  type UnmergedCode,
  type WorktreeStatus,
} from '../worktree/status.ts'
import { type Cmd, fail, requireWorktree } from './context.ts'

export function status(cmd: Cmd, argv: string[]): void {
  const parsed = parseArgs(argv, [
    { name: 'short', short: 's', long: ['short'] },
    { name: 'porcelain', long: ['porcelain'] },
    { name: 'branch', short: 'b', long: ['branch'] },
  ])
  if (!parsed.ok) fail(cmd, parsed.error, 129)
  const { flags, positionals } = parsed.args
  if (positionals.length > 0) fail(cmd, 'git-sensei: git status のパス指定には未対応です', 1)
  const git = requireWorktree(cmd)
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
  const head = headOid(git)
  if (!head) return `No commits yet on ${branch}`
  const upstream = upstreamOf(git, branch)
  if (!upstream) return branch
  const theirs = own(git.refs, upstream.tracking)
  if (!theirs) return `${branch}...${upstream.name} [gone]`
  const { ahead, behind } = aheadBehind(git, head, theirs)
  const parts = [ahead > 0 ? `ahead ${ahead}` : '', behind > 0 ? `behind ${behind}` : ''].filter(
    Boolean,
  )
  return `${branch}...${upstream.name}${parts.length > 0 ? ` [${parts.join(', ')}]` : ''}`
}

const commits = (n: number) => `${n} commit${n === 1 ? '' : 's'}`

/** "Your branch is ahead of 'origin/main' by 1 commit." など。上流がなければ空 */
export function trackingLines(git: GitDir): string[] {
  const branch = currentBranch(git)
  const head = headOid(git)
  if (branch === null || head === null) return []
  const upstream = upstreamOf(git, branch)
  if (!upstream) return []
  const theirs = own(git.refs, upstream.tracking)
  if (!theirs) {
    return [
      `Your branch is based on '${upstream.name}', but the upstream is gone.`,
      '  (use "git branch --unset-upstream" to fixup)',
    ]
  }
  const { ahead, behind } = aheadBehind(git, head, theirs)
  if (ahead === 0 && behind === 0) return [`Your branch is up to date with '${upstream.name}'.`]
  if (behind === 0) {
    return [
      `Your branch is ahead of '${upstream.name}' by ${commits(ahead)}.`,
      '  (use "git push" to publish your local commits)',
    ]
  }
  if (ahead === 0) {
    return [
      `Your branch is behind '${upstream.name}' by ${commits(behind)}, and can be fast-forwarded.`,
      '  (use "git pull" to update your local branch)',
    ]
  }
  return [
    `Your branch and '${upstream.name}' have diverged,`,
    `and have ${ahead} and ${behind} different commits each, respectively.`,
    '  (use "git pull" if you want to integrate the remote branch with yours)',
  ]
}

export function shortStatusLines(git: GitDir, st: WorktreeStatus): string[] {
  const paths = [
    ...new Set([...st.staged.keys(), ...st.unstaged.keys(), ...st.unmerged.keys()]),
  ].sort()
  const lines = paths.map(
    (p) => `${st.unmerged.get(p) ?? `${st.staged.get(p) ?? ' '}${st.unstaged.get(p) ?? ' '}`} ${p}`,
  )
  for (const p of collapseUntracked(git, st.untracked)) lines.push(`?? ${p}`)
  return lines
}

const LABELS = { A: 'new file:', M: 'modified:', D: 'deleted:' } as const
const label = (kind: keyof typeof LABELS) => LABELS[kind].padEnd(12)

const UNMERGED_LABELS: Record<UnmergedCode, string> = {
  UU: 'both modified:',
  AA: 'both added:',
  UD: 'deleted by them:',
  DU: 'deleted by us:',
  AU: 'added by us:',
  UA: 'added by them:',
  DD: 'both deleted:',
}

export function longStatusLines(git: GitDir, st: WorktreeStatus): string[] {
  const lines: string[] = []
  const branch = currentBranch(git)
  const head = headOid(git)
  if (branch !== null) {
    lines.push(`On branch ${branch}`)
    const tracking = trackingLines(git)
    if (tracking.length > 0) lines.push(...tracking, '')
  } else {
    const at = git.detachedAt === head ? 'at' : 'from'
    lines.push(`HEAD detached ${at} ${abbrev(git, git.detachedAt ?? (head as string))}`)
  }
  if (!head) lines.push('', 'No commits yet', '')
  if (git.merge) {
    lines.push(
      ...(st.unmerged.size > 0
        ? [
            'You have unmerged paths.',
            '  (fix conflicts and run "git commit")',
            '  (use "git merge --abort" to abort the merge)',
          ]
        : [
            'All conflicts fixed but you are still merging.',
            '  (use "git commit" to conclude merge)',
          ]),
      '',
    )
  }

  if (st.staged.size > 0) {
    lines.push('Changes to be committed:')
    // マージの途中は「restore --staged で戻せる」のヒントを出さない（git と同じ）
    if (!git.merge) {
      lines.push(
        head
          ? '  (use "git restore --staged <file>..." to unstage)'
          : '  (use "git rm --cached <file>..." to unstage)',
      )
    }
    for (const [path, kind] of [...st.staged].sort(([a], [b]) => (a < b ? -1 : 1))) {
      lines.push(`\t${label(kind)}${path}`)
    }
    lines.push('')
  }
  if (st.unmerged.size > 0) {
    const withDeletion = [...st.unmerged.values()].some((c) => c.includes('D'))
    lines.push(
      'Unmerged paths:',
      withDeletion
        ? '  (use "git add/rm <file>..." as appropriate to mark resolution)'
        : '  (use "git add <file>..." to mark resolution)',
    )
    for (const [path, code] of [...st.unmerged].sort(([a], [b]) => (a < b ? -1 : 1))) {
      lines.push(`\t${UNMERGED_LABELS[code].padEnd(17)}${path}`)
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
  } else if (st.unstaged.size > 0 || st.unmerged.size > 0) {
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
