// 利用者が決める名前（ファイル名・ブランチ名・サブコマンド）をキーにする表の道具。
// `key in obj` や `obj[key]` だと、'toString' や 'constructor' のような Object.prototype の名前が
// 「ある」ことになってしまう。存在の確認と読み出しは、必ず has / own を通す。

/**
 * プロトタイプを持たない表。'__proto__' もふつうのキーとして書き込める
 * （ふつうのオブジェクトだと、Immer の draft への '__proto__' の書き込みは黙って捨てられる）
 */
export function dict<V>(entries: Iterable<readonly [string, V]> = []): Record<string, V> {
  const out: Record<string, V> = Object.create(null)
  for (const [key, value] of entries) out[key] = value
  return out
}

/** 表のコピー。JSON から読み込んだ表を dict に戻すのにも使う */
export function copyDict<V>(obj: Record<string, V>): Record<string, V> {
  return dict(Object.entries(obj))
}

export function has(obj: object, key: string): boolean {
  return Object.hasOwn(obj, key)
}

/** 自分自身のプロパティだけを読む。Object.prototype から継承した値は返さない */
export function own<V>(obj: Record<string, V>, key: string): V | undefined {
  return Object.hasOwn(obj, key) ? obj[key] : undefined
}
