// エディタの「採用」ボタン（docs/03 §1.2）。コンフリクトの印の片側を残し、もう片側と印を消す。
// どちらかを丸ごと採ると、もう片方の変更は消える。それに気づくことも学びのうち（docs/06）。

export type Side = 'ours' | 'theirs'

export function resolveConflict(content: string, side: Side): string {
  const out: string[] = []
  let section: 'none' | 'ours' | 'theirs' = 'none'
  for (const line of content.split(/(?<=\n)/)) {
    if (section === 'none' && /^<{7}( |\n|$)/.test(line)) section = 'ours'
    else if (section === 'ours' && /^={7}(\n|$)/.test(line)) section = 'theirs'
    else if (section === 'theirs' && /^>{7}( |\n|$)/.test(line)) section = 'none'
    else if (section === 'none' || section === side) out.push(line)
  }
  return out.join('')
}

export function hasMarkers(content: string): boolean {
  return /^<{7}( |$)/m.test(content) && /^>{7}( |$)/m.test(content)
}
