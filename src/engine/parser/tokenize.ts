// シェル風の字句解析。クォート（' と "）とバックスラッシュのエスケープに対応する。
// リダイレクト（> と >>）は、出力先のファイルとして取り出す。パイプやコマンドのつなぎ（| && ;）は扱わない。

export interface Redirect {
  /** 出力先のファイル（入力されたままのパス） */
  path: string
  /** >> なら追記 */
  append: boolean
}

export type TokenizeResult =
  | { ok: true; argv: string[]; redirect?: Redirect }
  | { ok: false; error: string }

const UNSUPPORTED: Record<string, string> = {
  '|': 'パイプ（|）',
  '&&': 'コマンドのつなぎ（&&）',
  ';': 'コマンドの区切り（;）',
}

export function tokenize(input: string): TokenizeResult {
  const argv: string[] = []
  let current = ''
  let inToken = false
  let quote: "'" | '"' | null = null
  let redirect: Redirect | undefined
  /** 次の語がリダイレクト先になる */
  let pending: { append: boolean } | null = null

  const finishToken = () => {
    if (!inToken) return
    if (pending) {
      redirect = { path: current, append: pending.append }
      pending = null
    } else argv.push(current)
    current = ''
    inToken = false
  }

  for (let i = 0; i < input.length; i++) {
    const ch = input[i] as string
    if (quote === "'") {
      if (ch === "'") quote = null
      else current += ch
      continue
    }
    if (quote === '"') {
      if (ch === '"') quote = null
      else if (ch === '\\' && i + 1 < input.length && '"\\$`'.includes(input[i + 1] as string)) {
        current += input[++i]
      } else current += ch
      continue
    }
    if (ch === "'" || ch === '"') {
      quote = ch
      inToken = true
    } else if (ch === '\\' && i + 1 < input.length) {
      current += input[++i]
      inToken = true
    } else if (/\s/.test(ch)) {
      finishToken()
    } else if (ch === '>') {
      finishToken()
      if (pending) return { ok: false, error: 'リダイレクト（>）の後にファイル名がありません' }
      const append = input[i + 1] === '>'
      if (append) i++
      pending = { append }
    } else if (ch === '|' || ch === ';' || (ch === '&' && input[i + 1] === '&')) {
      const op = ch === '&' ? '&&' : ch
      return {
        ok: false,
        error: `${UNSUPPORTED[op]} はこのシミュレータではまだ使えません。1つずつ実行してください`,
      }
    } else {
      current += ch
      inToken = true
    }
  }

  if (quote !== null) return { ok: false, error: `クォート（${quote}）が閉じられていません` }
  finishToken()
  if (pending) return { ok: false, error: 'リダイレクト（>）の後にファイル名がありません' }
  return redirect ? { ok: true, argv, redirect } : { ok: true, argv }
}
