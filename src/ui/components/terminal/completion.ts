// Tab 補完。サブコマンド、ブランチ名、リモート名、ファイル名、主なオプションを補う。

export interface CompletionNames {
  branches: string[]
  files: string[]
  /** origin/main のようなリモート追跡ブランチ */
  remoteBranches?: string[]
  remotes?: string[]
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
  'clone',
  'commit',
  'config',
  'fetch',
  'init',
  'log',
  'merge',
  'pull',
  'push',
  'remote',
  'status',
  'switch',
]

const OPTIONS: Record<string, string[]> = {
  add: ['--all', '--update'],
  branch: ['--all', '--delete', '--move', '--remotes', '--set-upstream-to', '--show-current', '-D'],
  checkout: ['-b', '--detach'],
  commit: ['--all', '--amend', '--allow-empty', '--message', '--no-edit'],
  fetch: ['--prune'],
  log: ['--all', '--decorate', '--oneline'],
  merge: ['--ff-only', '--no-ff', '--abort', '--continue', '--no-edit'],
  pull: ['--ff-only', '--rebase', '--no-rebase'],
  push: ['--set-upstream', '--force', '--force-with-lease', '--delete'],
  status: ['--short', '--porcelain', '--branch'],
  switch: ['--create', '--detach'],
}

/** origin/feature/login → feature/login（git switch feature/login で追跡ブランチが作られる） */
function remoteShortNames(names: CompletionNames): string[] {
  return (names.remoteBranches ?? [])
    .map((r) => r.slice(r.indexOf('/') + 1))
    .filter((n) => n !== 'HEAD')
}

function argumentCandidates(sub: string, argIndex: number, names: CompletionNames): string[] {
  const remotes = names.remotes ?? []
  const tracking = names.remoteBranches ?? []
  switch (sub) {
    case 'add':
      return names.files
    case 'checkout':
      return [...names.branches, ...remoteShortNames(names), ...names.files]
    case 'switch':
      return [...names.branches, ...remoteShortNames(names)]
    case 'merge':
    case 'log':
      return [...names.branches, ...tracking]
    case 'branch':
      return [...names.branches, ...tracking]
    case 'push':
    case 'pull':
    case 'fetch':
      return argIndex === 0 ? remotes : names.branches
    case 'remote':
      return argIndex === 0 ? ['add', 'remove', 'get-url', '-v'] : remotes
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
  if (before.length === 0) pool = ['git', 'cd', 'ls', 'pwd', 'cat', 'clear', 'help']
  else if (before[0] === 'cat') pool = names.files
  else if (before[0] !== 'git') pool = []
  else if (before.length === 1) pool = SUBCOMMANDS
  else {
    const sub = before[1] as string
    const argIndex = before.slice(2).filter((t) => !t.startsWith('-')).length
    pool = current.startsWith('-') ? (OPTIONS[sub] ?? []) : argumentCandidates(sub, argIndex, names)
  }

  const hits = [...new Set(pool)].filter((c) => c.startsWith(current))
  if (hits.length === 0) return { input, candidates: [] }
  if (hits.length === 1) return { input: `${head}${hits[0]} `, candidates: [] }
  return { input: head + commonPrefix(hits), candidates: hits }
}
