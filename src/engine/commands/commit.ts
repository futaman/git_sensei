import { diffTrees, modeLines, summaryLine } from '../diff/treeDiff.ts'
import { formatGitDate } from '../format/date.ts'
import type { CommitObject, Signature } from '../model/types.ts'
import {
  abbrev,
  commitTree,
  flattenTree,
  readCommit,
  writeObject,
  writeTree,
} from '../objects/store.ts'
import { parseArgs } from '../parser/options.ts'
import { currentBranch, headOid } from '../refs.ts'
import { computeStatus } from '../worktree/status.ts'
import { type Cmd, configValue, exitKeep, fail, requireWorktree, unsupported } from './context.ts'
import { longStatusLines } from './status.ts'

/** -m のメッセージの整形（git の cleanup=whitespace 相当） */
export function cleanupMessage(raw: string): string {
  const lines = raw.split('\n').map((l) => l.replace(/\s+$/, ''))
  const out: string[] = []
  for (const line of lines) {
    if (line === '' && (out.length === 0 || out[out.length - 1] === '')) continue
    out.push(line)
  }
  while (out.length > 0 && out[out.length - 1] === '') out.pop()
  return out.length === 0 ? '' : `${out.join('\n')}\n`
}

/** いまの時刻での作者（user.name / user.email）。設定がなければ git と同じく止める */
export function signatureNow(cmd: Cmd): Signature {
  const name = configValue(cmd, 'user.name')
  const email = configValue(cmd, 'user.email')
  if (!name || !email) {
    fail(
      cmd,
      [
        'Author identity unknown',
        '',
        '*** Please tell me who you are.',
        '',
        'Run',
        '',
        '  git config --global user.email "you@example.com"',
        '  git config --global user.name "Your Name"',
        '',
        "to set your account's default identity.",
        'Omit --global to set the identity only in this repository.',
        '',
        'fatal: unable to auto-detect email address',
      ].join('\n'),
    )
  }
  return { name, email, ...cmd.ctx.now }
}

/** '#' で始まる行（エディタで消される説明）を除く */
export function stripComments(message: string): string {
  return message
    .split('\n')
    .filter((l) => !l.startsWith('#'))
    .join('\n')
}

/** 1段落目を1行にしたもの（git の %s） */
export function subjectOf(message: string): string {
  const paragraph = message.split(/\n\s*\n/)[0] ?? ''
  return paragraph.trim().split('\n').join(' ')
}

export function commit(cmd: Cmd, argv: string[]): void {
  const parsed = parseArgs(argv, [
    { name: 'message', short: 'm', long: ['message'], value: true, multiple: true },
    { name: 'all', short: 'a', long: ['all'] },
    { name: 'amend', long: ['amend'] },
    { name: 'no-edit', long: ['no-edit'] },
    { name: 'allow-empty', long: ['allow-empty'] },
    { name: 'quiet', short: 'q', long: ['quiet'] },
  ])
  if (!parsed.ok) fail(cmd, parsed.error, 129)
  const { flags, values, positionals } = parsed.args
  const git = requireWorktree(cmd)
  if (positionals.length > 0) fail(cmd, 'git-sensei: git commit のパス指定には未対応です', 1)

  const messages = values.get('message')
  const amend = flags.has('amend')
  const noEdit = flags.has('no-edit')
  const merging = git.merge
  if (merging && amend) fail(cmd, 'fatal: You are in the middle of a merge -- cannot amend.')
  if (Object.keys(git.unmerged).length > 0) {
    fail(
      cmd,
      [
        'error: Committing is not possible because you have unmerged files.',
        "hint: Fix them up in the work tree, and then use 'git add/rm <file>'",
        'hint: as appropriate to mark resolution and make a commit.',
        'fatal: Exiting because of an unresolved conflict.',
      ].join('\n'),
    )
  }
  // マージの途中なら、-m がなくてもマージのメッセージ（MERGE_MSG）でコミットできる
  if (!messages && !(amend && noEdit) && !merging) {
    unsupported(cmd, 'エディタでのコミットメッセージ入力（-m "メッセージ" を付けてください）')
  }

  if (flags.has('all')) {
    for (const [path, entry] of Object.entries(git.index)) {
      const content = cmd.ws.files[path]
      if (content === undefined) delete git.index[path]
      else git.index[path] = { oid: writeObject(git, { type: 'blob', content }), mode: entry.mode }
    }
  }

  const head = headOid(git)
  const old = amend && head ? readCommit(git, head) : null
  if (amend && !old) fail(cmd, 'fatal: You have nothing to amend.')
  const parents = old ? [...old.parents] : head ? [head] : []
  if (merging) parents.push(merging.head)
  const base = commitTree(git, parents[0] ?? null)
  const tree = writeTree(git, git.index)
  const unchanged = old
    ? false
    : merging
      ? false
      : head
        ? readCommit(git, head).tree === tree
        : Object.keys(git.index).length === 0

  if (unchanged && !flags.has('allow-empty')) {
    cmd.out.push(...longStatusLines(git, computeStatus(git, cmd.ws)))
    exitKeep(1)
  }

  const message = messages
    ? cleanupMessage(messages.join('\n\n'))
    : old && noEdit
      ? old.message
      : merging
        ? // --no-edit なら MERGE_MSG をそのまま、エディタを開いた扱いならコメント行を消す
          cleanupMessage(noEdit ? merging.message : stripComments(merging.message))
        : ''
  if (message === '') fail(cmd, 'Aborting commit due to empty commit message.', 1)

  const now = signatureNow(cmd)
  const obj: CommitObject = {
    type: 'commit',
    tree,
    parents,
    author: old ? old.author : now,
    committer: now,
    message,
  }
  const oid = writeObject(git, obj)
  if (git.head.type === 'symbolic') git.refs[git.head.ref] = oid
  else git.head = { type: 'detached', oid }
  git.merge = null

  const branch = currentBranch(git)
  cmd.events.push({ type: 'COMMIT_CREATED', oid, parents, branch, amend })
  if (flags.has('quiet')) return

  const where = branch ?? 'detached HEAD'
  const root = parents.length === 0 ? ' (root-commit)' : ''
  cmd.out.push(`[${where}${root} ${abbrev(git, oid)}] ${subjectOf(message)}`)
  if (obj.author.name !== now.name || obj.author.email !== now.email) {
    cmd.out.push(` Author: ${obj.author.name} <${obj.author.email}>`)
  }
  if (old) cmd.out.push(` Date: ${formatGitDate(obj.author.timestamp, obj.author.tzOffset)}`)
  const changes = diffTrees(git, base, flattenTree(git, tree))
  // マージコミットでは変更の要約を出さない（git と同じ）
  if (changes.length > 0 && parents.length < 2) {
    cmd.out.push(summaryLine(changes), ...modeLines(changes))
  }
}
