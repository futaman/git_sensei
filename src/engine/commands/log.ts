import { formatGitDate } from '../format/date.ts'
import type { GitDir, Oid } from '../model/types.ts'
import { abbrev, readCommit } from '../objects/store.ts'
import { parseArgs } from '../parser/options.ts'
import { currentBranch, HEADS, headOid, REMOTES, readRef, resolveRevision } from '../refs.ts'
import { subjectOf } from './commit.ts'
import { type Cmd, fail, requireRepo, unsupported } from './context.ts'

export function log(cmd: Cmd, argv: string[]): void {
  const parsed = parseArgs(
    argv,
    [
      { name: 'oneline', long: ['oneline'] },
      { name: 'all', long: ['all'] },
      { name: 'max-count', short: 'n', long: ['max-count'], value: true },
      { name: 'decorate', long: ['decorate'] },
      { name: 'graph', long: ['graph'] },
    ],
    { numericShorthand: 'max-count' },
  )
  if (!parsed.ok) fail(cmd, parsed.error, 129)
  const { flags, values, positionals } = parsed.args
  const git = requireRepo(cmd)
  if (flags.has('graph')) unsupported(cmd, 'git log --graph（グラフは画面の可視化を見てください）')
  if (positionals.some((p) => p.includes('..'))) unsupported(cmd, 'git log の範囲指定（a..b）')

  const starts: Oid[] = []
  for (const rev of positionals) {
    const oid = resolveRevision(git, rev)
    if (!oid) {
      fail(
        cmd,
        [
          `fatal: ambiguous argument '${rev}': unknown revision or path not in the working tree.`,
          "Use '--' to separate paths from revisions, like this:",
          "'git <command> [<revision>...] -- [<file>...]'",
        ].join('\n'),
      )
    }
    starts.push(oid)
  }
  if (flags.has('all')) {
    // git と同じく、ref を名前順に並べてから最後に HEAD（同じ日時のコミットの順序に効く）
    for (const ref of [...Object.keys(git.refs), ...Object.keys(git.symrefs)].sort()) {
      const oid = readRef(git, ref)
      if (oid) starts.push(oid)
    }
    const head = headOid(git)
    if (head) starts.push(head)
  }
  if (positionals.length === 0 && !flags.has('all')) {
    const head = headOid(git)
    if (!head) {
      fail(cmd, `fatal: your current branch '${currentBranch(git)}' does not have any commits yet`)
    }
    starts.push(head)
  }

  const maxCount = values.has('max-count') ? Number(values.get('max-count')?.[0]) : Infinity
  if (Number.isNaN(maxCount)) fail(cmd, "fatal: '-n' requires a number")
  // 負の数は「無制限」（本物の git と同じ）
  const limit = maxCount < 0 ? Infinity : maxCount
  const commits = walk(git, starts).slice(0, limit)
  const decorate = !argv.includes('--no-decorate') && (flags.has('decorate') || cmd.ctx.tty)
  const deco = decorate ? decorations(git) : new Map<Oid, string>()

  if (flags.has('oneline')) {
    for (const oid of commits) {
      const d = deco.get(oid)
      cmd.out.push(
        `${abbrev(git, oid)} ${d ? `(${d}) ` : ''}${subjectOf(readCommit(git, oid).message)}`,
      )
    }
    return
  }
  commits.forEach((oid, i) => {
    const c = readCommit(git, oid)
    const d = deco.get(oid)
    if (i > 0) cmd.out.push('')
    cmd.out.push(`commit ${oid}${d ? ` (${d})` : ''}`)
    if (c.parents.length > 1)
      cmd.out.push(`Merge: ${c.parents.map((p) => abbrev(git, p)).join(' ')}`)
    cmd.out.push(`Author: ${c.author.name} <${c.author.email}>`)
    cmd.out.push(`Date:   ${formatGitDate(c.author.timestamp, c.author.tzOffset)}`)
    cmd.out.push('')
    // git log は本文のタブを8桁ごとの空白に展開する（--expand-tabs が既定）
    for (const line of c.message.replace(/\n$/, '').split('\n')) {
      cmd.out.push(`    ${expandTabs(line)}`)
    }
  })
}

/** タブを、行頭から数えて8桁ごとの位置までの空白にする */
export function expandTabs(line: string): string {
  let out = ''
  for (const ch of line) out += ch === '\t' ? ' '.repeat(8 - (out.length % 8)) : ch
  return out
}

/** コミット日時の新しい順にたどる（同じ日時なら見つけた順） */
export function walk(git: GitDir, starts: Oid[]): Oid[] {
  const seen = new Set<Oid>()
  const queue: { oid: Oid; time: number; seq: number }[] = []
  let seq = 0
  const push = (oid: Oid) => {
    if (seen.has(oid)) return
    seen.add(oid)
    queue.push({ oid, time: readCommit(git, oid).committer.timestamp, seq: seq++ })
  }
  for (const s of starts) push(s)
  const out: Oid[] = []
  while (queue.length > 0) {
    let best = 0
    for (let i = 1; i < queue.length; i++) {
      const q = queue[i] as (typeof queue)[number]
      const b = queue[best] as (typeof queue)[number]
      if (q.time > b.time || (q.time === b.time && q.seq < b.seq)) best = i
    }
    const [next] = queue.splice(best, 1)
    if (!next) break
    out.push(next.oid)
    for (const p of readCommit(git, next.oid).parents) push(p)
  }
  return out
}

/**
 * "HEAD -> main, feature" のような装飾。git は ref を名前順に読んで先頭に積むので、
 * HEAD 以外は名前の逆順に並ぶ
 */
export function decorations(git: GitDir): Map<Oid, string> {
  const byOid = new Map<Oid, string[]>()
  const prepend = (oid: Oid, name: string) => {
    byOid.set(oid, [name, ...(byOid.get(oid) ?? [])])
  }
  const branch = currentBranch(git)
  for (const ref of [...Object.keys(git.refs), ...Object.keys(git.symrefs)].sort()) {
    const oid = readRef(git, ref)
    if (!oid) continue
    if (ref.startsWith(HEADS)) {
      const name = ref.slice(HEADS.length)
      if (name !== branch) prepend(oid, name)
    } else if (ref.startsWith(REMOTES)) {
      prepend(oid, ref.slice(REMOTES.length))
    }
  }
  const head = headOid(git)
  if (head) prepend(head, branch !== null ? `HEAD -> ${branch}` : 'HEAD')
  return new Map([...byOid].map(([oid, names]) => [oid, names.join(', ')]))
}
