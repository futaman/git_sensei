// 行単位の差分の量（追加行数・削除行数）。diffstat と commit の要約に使う。

/** 改行文字を含めて行に分ける。最終行に改行がなくても1行と数える */
export function splitLines(text: string): string[] {
  if (text === '') return []
  const lines = text.split(/(?<=\n)/)
  return lines
}

/** 最長共通部分列の長さ。最小の差分では 削除＝a−LCS、追加＝b−LCS になる */
function lcsLength(a: string[], b: string[]): number {
  let prev = new Array<number>(b.length + 1).fill(0)
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array<number>(b.length + 1).fill(0)
    for (let j = 1; j <= b.length; j++) {
      cur[j] =
        a[i - 1] === b[j - 1]
          ? (prev[j - 1] as number) + 1
          : Math.max(prev[j] as number, cur[j - 1] as number)
    }
    prev = cur
  }
  return prev[b.length] as number
}

export function countChanges(before: string, after: string): { ins: number; del: number } {
  const a = splitLines(before)
  const b = splitLines(after)
  // 共通の先頭と末尾を先に除いて計算量を減らす
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }
  const midA = a.slice(start, endA)
  const midB = b.slice(start, endB)
  const lcs = lcsLength(midA, midB)
  return { ins: midB.length - lcs, del: midA.length - lcs }
}
