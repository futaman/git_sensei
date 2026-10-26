// コマンド文字列を、分類に使える程度に分ける（クォートだけ考慮する）。
// engine の字句解析は値の import になるので使わない（drama は engine の型だけに依存する）。
export function tokenizeLoosely(command: string): string[] {
  const out: string[] = []
  const re = /"((?:\\.|[^"\\])*)"|'([^']*)'|(\S+)/g
  for (const m of command.matchAll(re)) out.push(m[1] ?? m[2] ?? m[3] ?? '')
  return out
}
