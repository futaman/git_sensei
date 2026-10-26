// ブランチ、HEAD、リビジョン指定（HEAD~1 など）の解決。
import type { HeadPosition } from './events.ts'
import { own } from './model/dict.ts'
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
  return git.head.type === 'detached' ? git.head.oid : (own(git.refs, git.head.ref) ?? null)
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

export const REMOTES = 'refs/remotes/'

/** refs/remotes/origin/main のような ref。symref（origin/HEAD）も辿る */
export function readRef(git: GitDir, ref: RefName): Oid | null {
  const target = own(git.symrefs, ref)
  if (target) return own(git.refs, target) ?? null
  return own(git.refs, ref) ?? null
}

/** 'origin/main' のような名前の一覧（origin/HEAD は除く） */
export function listRemoteBranches(git: GitDir): string[] {
  return Object.keys(git.refs)
    .filter((r) => r.startsWith(REMOTES))
    .map((r) => r.slice(REMOTES.length))
    .sort()
}

/** 設定されているリモートの名前（remote.<name>.url がある） */
export function listRemotes(git: GitDir): string[] {
  return Object.keys(git.config)
    .map((k) => /^remote\.(.+)\.url$/.exec(k)?.[1])
    .filter((n): n is string => n !== undefined)
    .sort()
}

export interface Upstream {
  remote: string
  /** リモート側の ref（refs/heads/main） */
  merge: RefName
  /** 手元のリモート追跡ブランチ（refs/remotes/origin/main） */
  tracking: RefName
  /** 表示用の名前（origin/main） */
  name: string
}

/** branch.<name>.remote / branch.<name>.merge から上流ブランチを求める */
export function upstreamOf(git: GitDir, branch: string): Upstream | null {
  const remote = own(git.config, `branch.${branch}.remote`)
  const merge = own(git.config, `branch.${branch}.merge`)
  if (!remote || !merge?.startsWith(HEADS)) return null
  const name = `${remote}/${merge.slice(HEADS.length)}`
  return { remote, merge, tracking: REMOTES + name, name }
}

export function setUpstream(
  git: GitDir,
  branch: string,
  remote: string,
  remoteBranch: string,
): void {
  git.config[`branch.${branch}.remote`] = remote
  git.config[`branch.${branch}.merge`] = branchRef(remoteBranch)
}

/**
 * リビジョン指定を解決する。対応：HEAD, @, ORIG_HEAD, MERGE_HEAD, ブランチ名, origin/main, origin, refs/...,
 * 16進の前方一致（4桁以上）, @{u}, 後ろに続く ~n, ^, ^n
 */
export function resolveRevision(git: GitDir, spec: string): Oid | null {
  const up = /^(.*?)@\{(?:u|upstream)\}(.*)$/.exec(spec)
  if (up) {
    const branch = up[1] === '' || up[1] === 'HEAD' ? currentBranch(git) : (up[1] as string)
    const upstream = branch === null ? null : upstreamOf(git, branch)
    if (!upstream) return null
    return resolveRevision(git, `${upstream.tracking}${up[2]}`)
  }
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
  if (base === 'ORIG_HEAD') return git.origHead ?? null
  if (base === 'MERGE_HEAD') return git.merge?.head ?? null
  // git と同じ順で探す：refs/<名前>, refs/heads/, refs/remotes/, refs/remotes/<名前>/HEAD
  for (const ref of [`refs/${base}`, branchRef(base), REMOTES + base, `${REMOTES}${base}/HEAD`]) {
    const oid = readRef(git, ref)
    if (oid) return oid
  }
  if (base.startsWith('refs/')) return readRef(git, base)
  if (/^[0-9a-f]{4,40}$/.test(base)) {
    const hits = Object.keys(git.objects).filter(
      (o) => o.startsWith(base) && own(git.objects, o)?.type === 'commit',
    )
    if (hits.length === 1) return hits[0] as Oid
  }
  return null
}
