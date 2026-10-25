// ブランチ、HEAD、リビジョン指定（HEAD~1 など）の解決。
import type { HeadPosition } from './events.ts'
import type { GitDir, Oid, RefName } from './model/types.ts'
import { readCommit } from './objects/store.ts'

export const HEADS = 'refs/heads/'

export const branchRef = (name: string): RefName => HEADS + name

/** HEAD が指しているブランチ名。detached なら null */
export function currentBranch(git: GitDir): string | null {
  return git.head.type === 'symbolic' && git.head.ref.startsWith(HEADS)
    ? git.head.ref.slice(HEADS.length)
    : null
}

/** HEAD が指すコミット。まだコミットがないブランチなら null */
export function headOid(git: GitDir): Oid | null {
  return git.head.type === 'detached' ? git.head.oid : (git.refs[git.head.ref] ?? null)
}

export function headPosition(git: GitDir): HeadPosition {
  const branch = currentBranch(git)
  if (branch !== null) return { branch, oid: headOid(git) }
  return { branch: null, oid: headOid(git) as Oid }
}

export function listBranches(git: GitDir): string[] {
  return Object.keys(git.refs)
    .filter((r) => r.startsWith(HEADS))
    .map((r) => r.slice(HEADS.length))
    .sort()
}

/** git check-ref-format --branch 相当の名前チェック */
export function isValidBranchName(name: string): boolean {
  if (name === '' || name === '@' || name === 'HEAD') return false
  if (name.startsWith('-') || name.endsWith('/') || name.endsWith('.')) return false
  if (name.endsWith('.lock') || name.includes('..') || name.includes('@{')) return false
  if (name.includes('//')) return false
  // biome-ignore lint/suspicious/noControlCharactersInRegex: gitの仕様どおり制御文字を禁止する
  if (/[\x00-\x20\x7f~^:?*[\\]/.test(name)) return false
  return name.split('/').every((part) => part !== '' && !part.startsWith('.'))
}

/**
 * リビジョン指定を解決する。対応：HEAD, @, ブランチ名, refs/..., 16進の前方一致（4桁以上）,
 * 後ろに続く ~n, ^, ^n
 */
export function resolveRevision(git: GitDir, spec: string): Oid | null {
  const m = /^(.*?)((?:[~^]\d*)*)$/.exec(spec)
  if (!m) return null
  const [, base = '', suffix = ''] = m
  let oid = resolveBase(git, base)
  for (const [, op, num] of suffix.matchAll(/([~^])(\d*)/g)) {
    if (oid === null) return null
    const n = num === '' ? 1 : Number(num)
    if (op === '~') {
      for (let i = 0; i < n && oid !== null; i++) oid = readCommit(git, oid).parents[0] ?? null
    } else if (n === 0) {
      // ^0 はコミットそのもの
    } else {
      oid = readCommit(git, oid).parents[n - 1] ?? null
    }
  }
  return oid
}

function resolveBase(git: GitDir, base: string): Oid | null {
  if (base === 'HEAD' || base === '@') return headOid(git)
  if (base.startsWith('refs/')) return git.refs[base] ?? null
  const branch = git.refs[branchRef(base)]
  if (branch) return branch
  if (/^[0-9a-f]{4,40}$/.test(base)) {
    const hits = Object.keys(git.objects).filter(
      (o) => o.startsWith(base) && git.objects[o]?.type === 'commit',
    )
    if (hits.length === 1) return hits[0] as Oid
  }
  return null
}
