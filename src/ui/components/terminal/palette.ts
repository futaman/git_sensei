// コマンドを組み立てるパレット（docs/08 の 9章）。
// 正解ではなく「いまの状態でできること」を部品のボタンとして並べる。
// 押すと入力欄に文字が足されるだけで、実行は学習者が「実行」を押したとき。
// 正解も誘惑（--force、--hard）も同じ重さで並べ、どれを選ぶかは学習者が決める。
import { type FileState, type GitDir, own, type RepoView } from '../../../engine/index.ts'

export interface PalettePart {
  /** 入力欄に足す文字（打たれる綴りそのまま）。末尾が空白なら、続きはキーボードで打つ */
  text: string
  /** 足したあと、カーソルを末尾から何文字戻すか（-m "" の引用符の中に置くため） */
  cursorBack?: number
  /** 危険な部品。ふちを赤くするだけで、隠さない */
  danger?: boolean
  /** ボタンの説明（長押し・マウスオーバー） */
  help?: string
}

export interface PaletteSection {
  title: string
  parts: PalettePart[]
}

export interface PaletteContext {
  git: GitDir | null
  files: FileState[]
  view: RepoView | null
  /** world にあるサーバー（bare リポジトリ）のパス */
  servers: string[]
  /** いまのフォルダの直下にあるリポジトリ（clone したもの） */
  clonedChildren: string[]
  /** 直前のコマンドで push が弾かれた */
  rejected?: boolean
}

const MAX_NAMES = 6

const part = (text: string, extra: Partial<PalettePart> = {}): PalettePart => ({ text, ...extra })
const FORCE_LEASE = part('--force-with-lease', {
  help: '最後に見た origin と違っていれば止まる force',
})
const FORCE = part('--force', {
  danger: true,
  help: 'origin を手元で上書きする。他人のコミットも消える',
})

/** 入力の中で引用符が閉じていない（コミットメッセージを打っている途中など） */
function insideQuote(input: string): boolean {
  return (input.match(/"/g) ?? []).length % 2 === 1
}

/** いまのフォルダの直下にあるディレクトリ名 */
function dirsOf(files: FileState[]): string[] {
  return [...new Set(files.map((f) => f.path.split('/')[0] as string).filter((d) => d !== ''))]
    .filter((d) => files.some((f) => f.path.startsWith(`${d}/`)))
    .sort()
}

function remotesOf(git: GitDir): string[] {
  return Object.keys(git.config)
    .map((k) => /^remote\.(.+)\.url$/.exec(k)?.[1])
    .filter((r): r is string => r !== undefined)
    .sort()
}

function hasUpstream(git: GitDir, branch: string | null): boolean {
  return branch !== null && own(git.config, `branch.${branch}.remote`) !== undefined
}

/** 空の入力のときに出す2つの段：見る／動く */
export function paletteForEmpty(ctx: PaletteContext): PaletteSection[] {
  const { git, files, view, servers, clonedChildren, rejected } = ctx
  if (!git) {
    const act = [
      ...clonedChildren.map((d) => part(`cd ${d}`)),
      ...servers.map((s) => part(`git clone ${s}`)),
      part('git init'),
    ]
    return [
      { title: '見る', parts: [part('ls'), part('cat')] },
      { title: '動く', parts: act },
    ]
  }
  if (git.bare) return [{ title: '動く', parts: [part('cd ~')] }]

  const conflicted = files.filter((f) => f.worktree === 'conflicted')
  if (git.merge) {
    return [
      { title: '見る', parts: [part('git status'), part('git diff')] },
      {
        title: 'マージ中',
        parts: [
          ...conflicted.slice(0, 3).map((f) => part(`git add ${f.path}`)),
          part('git commit --no-edit'),
          part('git merge --abort', { help: 'マージをやめて、始める前に戻す' }),
        ],
      },
    ]
  }

  const changed = files.filter((f) => f.worktree !== 'clean')
  const staged = files.filter((f) => f.staged !== null)
  const remotes = remotesOf(git)
  const act: PalettePart[] = []
  if (changed.length > 0) act.push(part('git add'), part('git diff'), part('git restore'))
  if (staged.length > 0) act.push(part('git commit'), part('git restore --staged'))
  if (remotes.length > 0) {
    if (rejected) {
      act.push(
        part('git pull'),
        part('git fetch'),
        part(`git push ${FORCE_LEASE.text}`, { help: FORCE_LEASE.help }),
        part(`git push ${FORCE.text}`, { danger: true, help: FORCE.help }),
      )
    } else act.push(part('git pull'), part('git push'), part('git fetch'))
  }
  if (view && view.branch === null) act.push(part('git switch -c '), part('git switch'))
  if (view && view.commits.length > 0)
    act.push(part('git log'), part('git switch'), part('git branch'), part('git reset'))
  act.push(part('git rm'), part('cd'), part('ls'), part('cat'))

  return [
    {
      title: '見る',
      parts: [part('git status'), part('git log --oneline'), part('git diff'), part('git show')],
    },
    { title: '動く', parts: dedupe(act) },
  ]
}

function dedupe(parts: PalettePart[]): PalettePart[] {
  const seen = new Set<string>()
  return parts.filter((p) => {
    if (seen.has(p.text)) return false
    seen.add(p.text)
    return true
  })
}

/** 組み立ての途中：いまの入力に続けて足せる部品 */
export function paletteForInput(input: string, ctx: PaletteContext): PaletteSection[] {
  if (input.trim() === '') return paletteForEmpty(ctx)
  if (insideQuote(input)) return []
  const tokens = input.trim().split(/\s+/)
  const [head, ...rest] = tokens
  if (head === 'git') {
    if (rest.length === 0) {
      // 「git」だけ：動くの段からサブコマンドを取り出す
      const act = paletteForEmpty(ctx).find((s) => s.title !== '見る')?.parts ?? []
      return [
        {
          title: '続き',
          parts: dedupe(
            act
              .filter((p) => p.text.startsWith('git '))
              .map((p) => part(p.text.slice(4).split(' ')[0] as string)),
          ),
        },
      ]
    }
    const [sub, ...args] = rest
    const parts = partsForSub(sub as string, args, ctx)
    return parts.length === 0 ? [] : [{ title: '続き', parts: notUsed(parts, args) }]
  }
  const parts = partsForShell(head as string, rest, ctx)
  return parts.length === 0 ? [] : [{ title: '続き', parts: notUsed(parts, rest) }]
}

/** すでに入力にある部品は出さない */
function notUsed(parts: PalettePart[], used: string[]): PalettePart[] {
  const set = new Set(used)
  return parts.filter((p) => !set.has(p.text.trim().split(' ')[0] as string))
}

function partsForSub(sub: string, used: string[], ctx: PaletteContext): PalettePart[] {
  const { git, files, view, servers, rejected } = ctx
  const changed = files.filter((f) => f.worktree !== 'clean')
  const staged = files.filter((f) => f.staged !== null)
  const tracked = files.filter((f) => f.worktree !== 'untracked')
  const names = (list: FileState[]) => list.slice(0, MAX_NAMES).map((f) => part(f.path))
  const branches =
    view?.branches.filter((b) => b.name !== view.branch).map((b) => part(b.name)) ?? []
  const remoteBranches = view?.remoteBranches.map((r) => part(r.name)) ?? []
  const remotes = git ? remotesOf(git) : []
  const origin = remotes[0] ?? 'origin'
  const current = view?.branch ?? null

  switch (sub) {
    case 'add': {
      const first = changed.filter((f) => f.worktree === 'conflicted')
      const others = changed.filter((f) => f.worktree !== 'conflicted')
      return [...names([...first, ...others]), part('.')]
    }
    case 'commit': {
      const parts: PalettePart[] = []
      const amend = used.includes('--amend')
      if (staged.length > 0 || amend) parts.push(part('-m ""', { cursorBack: 1 }))
      if (changed.some((f) => f.worktree === 'modified' || f.worktree === 'deleted'))
        parts.push(part('-a', { help: '追跡中のファイルの変更を、add せずにまとめて入れる' }))
      parts.push(part('--amend', { help: '直前のコミットを作り直す（push 前なら安全）' }))
      if (amend) parts.unshift(part('--no-edit', { help: 'メッセージはそのまま' }))
      if (staged.length === 0 && !amend) parts.push(part('-m ""', { cursorBack: 1 }))
      return parts
    }
    case 'push': {
      const parts: PalettePart[] = []
      if (git && !hasUpstream(git, current) && current && remotes.length > 0)
        parts.push(
          part(`-u ${origin} ${current}`, {
            help: '初めての push。次から git push だけでよくなる',
          }),
        )
      if (rejected || used.length > 0) parts.push(FORCE_LEASE, FORCE)
      if (current) parts.push(part(`${origin} ${current}`))
      return parts
    }
    case 'pull':
      return [
        part('--no-rebase', { help: 'マージで取り込む' }),
        part('--rebase', { help: '手元のコミットを origin の上に乗せ直す' }),
        ...(current ? [part(`${origin} ${current}`)] : []),
      ]
    case 'fetch':
      return [part('--prune'), ...remotes.map((r) => part(r))]
    case 'switch':
      if (used.includes('-c')) return []
      return [
        ...branches,
        part('-c ', { help: '新しいブランチを作って移る。名前は続けて打つ' }),
        part('-', { help: 'さっきいたブランチへ' }),
      ]
    case 'checkout':
      return [...branches, part('-- ')]
    case 'restore': {
      if (used.includes('--staged')) return names(staged)
      const parts: PalettePart[] = []
      if (staged.length > 0)
        parts.push(part('--staged', { help: 'ステージから下ろす。ファイルは変えない' }))
      parts.push(part('--source HEAD ', { help: '最後のコミットの中身に戻す' }))
      return [
        ...parts,
        ...names(changed.filter((f) => f.worktree === 'modified' || f.worktree === 'deleted')),
      ]
    }
    case 'reset':
      return [
        part('--soft HEAD~1', { help: 'コミットだけ取り消す。変更はステージに残る' }),
        part('HEAD~1', { help: 'コミットとステージを取り消す。ファイルはそのまま' }),
        part('--hard HEAD~1', {
          danger: true,
          help: 'ファイルごと戻す。コミットしていない変更は消える',
        }),
        part('--hard ORIG_HEAD', { danger: true, help: 'reset や merge の直前に戻す' }),
        ...names(staged),
      ]
    case 'rm':
      return [
        part('--cached', { help: 'git の追跡から外すだけ。ファイルは残る' }),
        part('-r', { help: 'ディレクトリごと' }),
        ...names(tracked),
      ]
    case 'log':
      return [
        part('--oneline'),
        part('--all'),
        part('--graph'),
        part('-n 5'),
        ...remoteBranches,
        ...branches,
      ]
    case 'merge':
      return git?.merge ? [part('--abort')] : [...branches, ...remoteBranches, part('--no-edit')]
    case 'branch':
      return [part('-a'), part('-d ', { help: 'ブランチを消す' }), ...branches]
    case 'diff':
      return [
        part('--staged', { help: 'ステージと最後のコミットの差' }),
        part('HEAD'),
        ...names(changed),
        ...remoteBranches,
      ]
    case 'show':
      return [
        part('HEAD'),
        part('HEAD~1'),
        ...(view?.commits.slice(0, 4).map((c) => part(c.short)) ?? []),
        ...remoteBranches,
      ]
    case 'clone':
      return servers.map((s) => part(s))
    case 'remote':
      return [part('-v'), part('add origin ')]
    default:
      return []
  }
}

function partsForShell(head: string, used: string[], ctx: PaletteContext): PalettePart[] {
  const { files, clonedChildren } = ctx
  const dirs = [...new Set([...clonedChildren, ...dirsOf(files)])].sort()
  switch (head) {
    case 'cd':
      return used.length > 0 ? [] : [...dirs.map((d) => part(d)), part('..'), part('~')]
    case 'ls':
      return [part('-a'), ...dirs.map((d) => part(d))]
    case 'cat':
      return files.slice(0, MAX_NAMES + 2).map((f) => part(f.path))
    case 'rm':
      return [part('-r'), ...files.slice(0, MAX_NAMES).map((f) => part(f.path))]
    default:
      return []
  }
}

/** 部品を入力欄に足したあとの文字列 */
export function appendPart(input: string, text: string): string {
  const base = input.trimEnd()
  if (base === '') return text
  return `${base} ${text}`
}

/** 最後の部品を消す（空白で区切った最後の語） */
export function dropLastPart(input: string): string {
  const base = input.trimEnd()
  const i = base.lastIndexOf(' ')
  return i < 0 ? '' : `${base.slice(0, i)} `
}
