// 行単位の差分（Myers の O(ND) 法）と、git diff の unified 形式の出力（xdiff の xemit.c に合わせる）。
// 前後3行の文脈、ハンク見出しの関数名（英字・_・$ で始まる行）、"\ No newline at end of file" に対応する。
// git の indent heuristic（変更のまとまりを上下にずらす調整）はしないので、ずらし方が何通りもある変更
// （同じ行が続くところへの挿入など）では、本物と見出しの位置がずれることがある。
import { splitLines } from './lines.ts'

/** 変更された行の印（xdiff の rchg）。a[i] が消えた / b[j] が足された */
interface Changes {
  removed: boolean[]
  added: boolean[]
}

/** Myers の差分。共通部分が最長になる編集のうち、削除を先に選ぶ */
function myers(a: string[], b: string[]): Changes {
  const removed = new Array<boolean>(a.length).fill(false)
  const added = new Array<boolean>(b.length).fill(false)
  const n = a.length
  const m = b.length
  const max = n + m
  const offset = max + 1
  const v = new Array<number>(2 * max + 3).fill(0)
  const trace: number[][] = []
  outer: for (let d = 0; d <= max; d++) {
    trace.push(v.slice())
    for (let k = -d; k <= d; k += 2) {
      let x: number
      if (k === -d || (k !== d && (v[offset + k - 1] as number) < (v[offset + k + 1] as number))) {
        x = v[offset + k + 1] as number
      } else {
        x = (v[offset + k - 1] as number) + 1
      }
      let y = x - k
      while (x < n && y < m && a[x] === b[y]) {
        x++
        y++
      }
      v[offset + k] = x
      if (x >= n && y >= m) break outer
    }
  }
  // 最後から辿って、どの行が消えた・足されたかを決める
  let x = n
  let y = m
  for (let d = trace.length - 1; d > 0; d--) {
    const prev = trace[d] as number[]
    const k = x - y
    const down =
      k === -d || (k !== d && (prev[offset + k - 1] as number) < (prev[offset + k + 1] as number))
    const prevK = down ? k + 1 : k - 1
    const prevX = prev[offset + prevK] as number
    const prevY = prevX - prevK
    while (x > prevX && y > prevY) {
      x--
      y--
    }
    if (down) added[prevY] = true
    else removed[prevX] = true
    x = prevX
    y = prevY
  }
  return { removed, added }
}

/** ハンク見出しに付ける関数名の行（git の既定：英字・_・$ で始まる行。80バイトまで、末尾の空白を除く） */
function funcName(line: string): string | null {
  if (!/^[A-Za-z_$]/.test(line)) return null
  const bytes = new TextEncoder().encode(line)
  let text = new TextDecoder().decode(bytes.slice(0, 80))
  text = text.replace(/\s+$/, '')
  return text
}

const CONTEXT = 3

interface Hunk {
  /** a の範囲（0始まり）と b の範囲 */
  a0: number
  a1: number
  b0: number
  b1: number
}

/** 2つのテキストの差分を、ハンク（文脈つき）の行にする。差分がなければ空 */
export function unifiedHunks(before: string, after: string): string[] {
  const a = splitLines(before)
  const b = splitLines(after)
  const { removed, added } = myers(a, b)

  // 変更のまとまり（a と b で対応する範囲）を順に集める
  const groups: Hunk[] = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && !removed[i] && !added[j]) {
      i++
      j++
      continue
    }
    const g = { a0: i, a1: i, b0: j, b1: j }
    while (i < a.length && removed[i]) i++
    while (j < b.length && added[j]) j++
    g.a1 = i
    g.b1 = j
    if (g.a0 === g.a1 && g.b0 === g.b1) {
      // 片方だけが終わった（もう片方の残りは変更済みのはず）
      i++
      j++
      continue
    }
    groups.push(g)
  }
  if (groups.length === 0) return []

  // 間の変わらない行が 2×文脈 以下なら、1つのハンクにまとめる
  const hunks: Hunk[][] = []
  for (const g of groups) {
    const last = hunks.at(-1)
    const prev = last?.at(-1)
    if (last && prev && g.a0 - prev.a1 <= 2 * CONTEXT) last.push(g)
    else hunks.push([g])
  }

  const out: string[] = []
  let func = ''
  let funcSearchLimit = -1
  for (const hunk of hunks) {
    const first = hunk[0] as Hunk
    const last = hunk.at(-1) as Hunk
    const a0 = Math.max(first.a0 - CONTEXT, 0)
    const b0 = Math.max(first.b0 - CONTEXT, 0)
    const a1 = Math.min(last.a1 + CONTEXT, a.length)
    const b1 = Math.min(last.b1 + CONTEXT, b.length)

    // 関数名：ハンクの直前の行から上へ探す（前のハンクで探したところまで）。見つからなければ前のまま
    for (let l = a0 - 1; l > funcSearchLimit && l >= 0; l--) {
      const name = funcName((a[l] as string).replace(/\n$/, ''))
      if (name !== null) {
        func = name
        break
      }
    }
    funcSearchLimit = a0 - 1

    const range = (start: number, count: number) =>
      count === 1 ? `${start + 1}` : `${count === 0 ? start : start + 1},${count}`
    out.push(`@@ -${range(a0, a1 - a0)} +${range(b0, b1 - b0)} @@${func ? ` ${func}` : ''}`)

    const line = (prefix: string, text: string) => {
      if (text.endsWith('\n')) out.push(prefix + text.slice(0, -1))
      else out.push(prefix + text, '\\ No newline at end of file')
    }
    let x = a0
    let y = b0
    for (const g of hunk) {
      for (; x < g.a0; x++, y++) line(' ', a[x] as string)
      for (; x < g.a1; x++) line('-', a[x] as string)
      for (; y < g.b1; y++) line('+', b[y] as string)
    }
    for (; x < a1; x++, y++) line(' ', a[x] as string)
  }
  return out
}
