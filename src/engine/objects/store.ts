// オブジェクトの保存と読み出し。tree と index（パス→blob の平らな表）の相互変換もここで行う。
import type {
  BlobObject,
  CommitObject,
  FileMode,
  FilePath,
  GitDir,
  GitObject,
  IndexEntry,
  Oid,
  TreeEntry,
  TreeObject,
} from '../model/types.ts'
import { hashObject } from './serialize.ts'

export function writeObject(git: GitDir, obj: GitObject): Oid {
  const oid = hashObject(obj)
  if (!(oid in git.objects)) git.objects[oid] = obj
  return oid
}

function read<T extends GitObject['type']>(
  git: GitDir,
  oid: Oid,
  type: T,
): Extract<GitObject, { type: T }> {
  const obj = git.objects[oid]
  if (!obj || obj.type !== type) throw new Error(`${type} ${oid} がありません`)
  return obj as Extract<GitObject, { type: T }>
}

export const readBlob = (git: GitDir, oid: Oid): BlobObject => read(git, oid, 'blob')
export const readTree = (git: GitDir, oid: Oid): TreeObject => read(git, oid, 'tree')
export const readCommit = (git: GitDir, oid: Oid): CommitObject => read(git, oid, 'commit')

/** パス→blob の平らな表。index と同じ形 */
export type FlatTree = Record<FilePath, IndexEntry>

export function flattenTree(git: GitDir, treeOid: Oid, prefix = ''): FlatTree {
  const out: FlatTree = {}
  for (const e of readTree(git, treeOid).entries) {
    const path = prefix + e.name
    if (e.mode === '40000') Object.assign(out, flattenTree(git, e.oid, `${path}/`))
    else out[path] = { oid: e.oid, mode: e.mode }
  }
  return out
}

export function commitTree(git: GitDir, commitOid: Oid | null): FlatTree {
  return commitOid ? flattenTree(git, readCommit(git, commitOid).tree) : {}
}

/** index（平らな表）から tree オブジェクトを作り、ルートの oid を返す */
export function writeTree(git: GitDir, flat: FlatTree): Oid {
  interface Dir {
    files: Map<string, { oid: Oid; mode: FileMode }>
    dirs: Map<string, Dir>
  }
  const root: Dir = { files: new Map(), dirs: new Map() }
  for (const [path, entry] of Object.entries(flat)) {
    const parts = path.split('/')
    const name = parts.pop() as string
    let dir = root
    for (const part of parts) {
      let child = dir.dirs.get(part)
      if (!child) {
        child = { files: new Map(), dirs: new Map() }
        dir.dirs.set(part, child)
      }
      dir = child
    }
    dir.files.set(name, entry)
  }
  const write = (dir: Dir): Oid => {
    const entries: TreeEntry[] = []
    for (const [name, e] of dir.files) entries.push({ mode: e.mode, name, oid: e.oid })
    for (const [name, sub] of dir.dirs) entries.push({ mode: '40000', name, oid: write(sub) })
    return writeObject(git, { type: 'tree', entries })
  }
  return write(root)
}

/** commit から辿れるすべての祖先（自分を含む） */
export function ancestors(git: GitDir, oid: Oid): Set<Oid> {
  const seen = new Set<Oid>()
  const stack = [oid]
  while (stack.length > 0) {
    const cur = stack.pop() as Oid
    if (seen.has(cur)) continue
    seen.add(cur)
    stack.push(...readCommit(git, cur).parents)
  }
  return seen
}

export function isAncestor(git: GitDir, maybeAncestor: Oid, of: Oid): boolean {
  return ancestors(git, of).has(maybeAncestor)
}

/** 短縮ハッシュ。7桁から始め、他のオブジェクトと区別できるまで伸ばす */
export function abbrev(git: GitDir, oid: Oid, min = 7): string {
  const all = Object.keys(git.objects)
  for (let len = min; len < oid.length; len++) {
    const prefix = oid.slice(0, len)
    if (all.filter((o) => o.startsWith(prefix)).length <= 1) return prefix
  }
  return oid
}
