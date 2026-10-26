// git の pathspec（ファイル名、ディレクトリ名、'.'、* ? [...] のワイルドカード）。
import type { FilePath } from '../model/types.ts'

export type Matcher = (path: FilePath) => boolean

function normalize(spec: string): string {
  let s = spec
  while (s.startsWith('./')) s = s.slice(2)
  while (s.endsWith('/') && s.length > 1) s = s.slice(0, -1)
  return s === '.' ? '' : s
}

/** [:alpha:] などの文字クラス（wildmatch と同じもの） */
const CHAR_CLASSES: Record<string, string> = {
  alnum: '0-9A-Za-z',
  alpha: 'A-Za-z',
  blank: ' \\t',
  cntrl: '\\x00-\\x1f\\x7f',
  digit: '0-9',
  graph: '\\x21-\\x7e',
  lower: 'a-z',
  print: '\\x20-\\x7e',
  punct: '!-/:-@\\[-`{-~',
  space: '\\s',
  upper: 'A-Z',
  xdigit: '0-9A-Fa-f',
}

const escapeRe = (ch: string) => ch.replace(/[\\^$.*+?()[\]{}|/-]/g, '\\$&')

/**
 * [...] の中身を正規表現の文字クラスにする。start は '[' の次の位置。
 * 閉じていない、または知らない文字クラスなら null（git の wildmatch は何にも一致しない）
 */
function bracket(s: string, start: number): { re: string; end: number } | null {
  let i = start
  let negate = false
  if (s[i] === '!' || s[i] === '^') {
    negate = true
    i++
  }
  let body = ''
  let first = true
  while (i < s.length) {
    let ch = s[i] as string
    if (ch === ']' && !first) return { re: `[${negate ? '^' : ''}${body}]`, end: i + 1 }
    first = false
    if (ch === '[' && s[i + 1] === ':') {
      const close = s.indexOf(':]', i + 2)
      if (close === -1) return null
      const name = s.slice(i + 2, close)
      if (!Object.hasOwn(CHAR_CLASSES, name)) return null
      body += CHAR_CLASSES[name]
      i = close + 2
      continue
    }
    if (ch === '\\') {
      i++
      if (i >= s.length) return null
      ch = s[i] as string
    }
    // a-z のような範囲。'-' が最後なら文字そのもの
    if (s[i + 1] === '-' && s[i + 2] !== undefined && s[i + 2] !== ']') {
      let hi = s[i + 2] as string
      let next = i + 3
      if (hi === '\\') {
        hi = s[i + 3] ?? ''
        next = i + 4
        if (hi === '') return null
      }
      // 逆向きの範囲（z-a）は何にも一致しない。JS の正規表現ではエラーになるので飛ばす
      if (ch <= hi) body += `${escapeRe(ch)}-${escapeRe(hi)}`
      i = next
      continue
    }
    body += escapeRe(ch)
    i++
  }
  return null
}

/** glob を正規表現にする。git の pathspec では * が '/' もまたぐ。作れなければ null */
function globToRegExp(s: string): RegExp | null {
  let re = ''
  let i = 0
  while (i < s.length) {
    const ch = s[i] as string
    if (ch === '*') {
      re += '.*'
      i++
    } else if (ch === '?') {
      re += '.'
      i++
    } else if (ch === '[') {
      const b = bracket(s, i + 1)
      if (!b) return null
      re += b.re
      i = b.end
    } else if (ch === '\\' && i + 1 < s.length) {
      re += escapeRe(s[i + 1] as string)
      i += 2
    } else {
      re += escapeRe(ch)
      i++
    }
  }
  return new RegExp(`^${re}(/.*)?$`, 's')
}

export function pathspecMatcher(spec: string): Matcher {
  const s = normalize(spec)
  if (s === '') return () => true
  // ワイルドカードを含んでいても、名前どおりのファイル（'a[b]' など）には一致する（git と同じ）
  const literal: Matcher = (p) => p === s || p.startsWith(`${s}/`)
  if (!/[*?[\\]/.test(s)) return literal
  const re = globToRegExp(s)
  if (!re) return literal
  return (p) => literal(p) || re.test(p)
}
