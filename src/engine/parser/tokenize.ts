// シェル風の字句解析。クォート（' と "）とバックスラッシュのエスケープに対応する。
// パイプやリダイレクトなどのシェル機能は扱わない。

export type TokenizeResult = { ok: true; argv: string[] } | { ok: false; error: string }

export function tokenize(input: string): TokenizeResult {
  const argv: string[] = []
  let current = ''
  let inToken = false
  let quote: "'" | '"' | null = null

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
      if (inToken) argv.push(current)
      current = ''
      inToken = false
    } else {
      current += ch
      inToken = true
    }
  }

  if (quote !== null) return { ok: false, error: `クォート（${quote}）が閉じられていません` }
  if (inToken) argv.push(current)
  return { ok: true, argv }
}
