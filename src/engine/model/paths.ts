// ワークスペース（ディレクトリ）のパスの扱い。区切りは '/'、絶対パスは '/' から始まる。
import { dict } from './dict.ts'
import type { GitDir, Workspace, World } from './types.ts'

const driveOf = (s: string) => /^[A-Za-z]:\//.exec(s)?.[0]

/**
 * base を起点に p を解決した絶対パス（. と .. を畳む）。
 * Windows のドライブ名から始まるパス（C:/Users/...）も絶対パスとして扱う
 */
export function resolvePath(base: string, p: string): string {
  // https://host/path は、/host/path というサーバーの場所として扱う（シミュレータの中の origin）
  const raw = p.replace(/^file:\/\//, '').replace(/^(https?|ssh):\/\//, '/')
  const full = raw.startsWith('/') || driveOf(raw) ? raw : `${base}/${raw}`
  const drive = driveOf(full)
  const out: string[] = []
  for (const part of (drive ? full.slice(drive.length) : full).split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return `${drive ?? '/'}${out.join('/')}`
}

export function basename(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? ''
}

export function parentPath(path: string): string {
  return resolvePath(path, '..')
}

/** パスからワークスペースを探す。[キー, ワークスペース] */
export function findWorkspace(world: World, path: string): [string, Workspace] | null {
  const target = resolvePath('/', path)
  for (const [key, ws] of Object.entries(world.workspaces)) {
    if (resolvePath('/', ws.path) === target) return [key, ws]
  }
  return null
}

export function emptyGitDir(branch: string, bare: boolean): GitDir {
  return {
    bare,
    objects: dict(),
    refs: dict(),
    symrefs: dict(),
    head: { type: 'symbolic', ref: `refs/heads/${branch}` },
    index: dict(),
    unmerged: dict(),
    merge: null,
    config: dict(),
    previousBranch: null,
    detachedAt: null,
  }
}

/** 空のフォルダを足す（mkdir 相当）。world は Immer の draft でもよい。キーは絶対パス */
export function addWorkspaceTo(world: World, path: string): void {
  const abs = resolvePath('/', path)
  if (findWorkspace(world, abs)) return
  world.workspaces[abs] = { path: abs, files: dict(), git: null }
}
