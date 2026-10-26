// ワークスペース（ディレクトリ）のパスの扱い。区切りは '/'、絶対パスは '/' から始まる。
import type { GitDir, Workspace, World } from './types.ts'

/** base を起点に p を解決した絶対パス（. と .. を畳む） */
export function resolvePath(base: string, p: string): string {
  const raw = p.replace(/^file:\/\//, '')
  const parts = (raw.startsWith('/') ? raw : `${base}/${raw}`).split('/')
  const out: string[] = []
  for (const part of parts) {
    if (part === '' || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return `/${out.join('/')}`
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
    objects: {},
    refs: {},
    symrefs: {},
    head: { type: 'symbolic', ref: `refs/heads/${branch}` },
    index: {},
    config: {},
    previousBranch: null,
    detachedAt: null,
  }
}
