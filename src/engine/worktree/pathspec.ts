// git の pathspec（ファイル名、ディレクトリ名、'.'、* と ? のワイルドカード）。
import type { FilePath } from '../model/types.ts'

export type Matcher = (path: FilePath) => boolean

function normalize(spec: string): string {
  let s = spec
  while (s.startsWith('./')) s = s.slice(2)
  while (s.endsWith('/') && s.length > 1) s = s.slice(0, -1)
  return s === '.' ? '' : s
}

export function pathspecMatcher(spec: string): Matcher {
  const s = normalize(spec)
  if (s === '') return () => true
  if (/[*?[]/.test(s)) {
    // git の pathspec では * が '/' もまたぐ
    const re = new RegExp(
      `^${s
        .replace(/[.+^${}()|\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.')}(/.*)?$`,
    )
    return (p) => re.test(p)
  }
  return (p) => p === s || p.startsWith(`${s}/`)
}
