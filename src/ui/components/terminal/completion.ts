// Tab 補完。サブコマンド、ブランチ名、ファイル名、主なオプションを補う。

export interface CompletionNames {
  branches: string[]
  files: string[]
}

export interface CompletionResult {
  /** 補完後の入力 */
  input: string
  /** 候補が複数あるときの一覧（1つに決まったときは空） */
  candidates: string[]
}

const SUBCOMMANDS = [
  'add',
  'branch',
  'checkout',
  'commit',
  'init',
  'log',
  'merge',
  'status',
  'switch',
]

const OPTIONS: Record<string, string[]> = {
  add: ['--all', '--update'],
  branch: ['--delete', '--move', '--show-current', '-D'],
  checkout: ['-b', '--detach'],
  commit: ['--all', '--amend', '--allow-empty', '--message', '--no-edit'],
  log: ['--all', '--decorate', '--oneline'],
  merge: ['--ff-only'],
  status: ['--short', '--porcelain', '--branch'],
  switch: ['--create', '--detach'],
}

function argumentCandidates(sub: string, names: CompletionNames): string[] {
  switch (sub) {
    case 'add':
      return names.files
    case 'checkout':
      return [...names.branches, ...names.files]
    case 'switch':
    case 'merge':
    case 'branch':
    case 'log':
      return names.branches
    default:
      return []
  }
}

function commonPrefix(words: string[]): string {
  if (words.length === 0) return ''
  let prefix = words[0] as string
  for (const w of words) while (!w.startsWith(prefix)) prefix = prefix.slice(0, -1)
  return prefix
}

export function complete(input: string, names: CompletionNames): CompletionResult {
  const tokens = input.split(/\s+/)
  const current = tokens.pop() ?? ''
  const before = tokens.filter((t) => t !== '')
  const head = input.slice(0, input.length - current.length)

  let pool: string[]
  if (before.length === 0) pool = ['git', 'clear', 'help']
  else if (before[0] !== 'git') pool = []
  else if (before.length === 1) pool = SUBCOMMANDS
  else {
    const sub = before[1] as string
    pool = current.startsWith('-') ? (OPTIONS[sub] ?? []) : argumentCandidates(sub, names)
  }

  const hits = [...new Set(pool)].filter((c) => c.startsWith(current))
  if (hits.length === 0) return { input, candidates: [] }
  if (hits.length === 1) return { input: `${head}${hits[0]} `, candidates: [] }
  return { input: head + commonPrefix(hits), candidates: hits }
}
