// gitと同じ形式でオブジェクトを直列化し、SHA-1を計算する。
// 作者・日時・内容が同じなら、本物のgitとハッシュ値まで一致する。
import { sha1 } from '@noble/hashes/legacy.js'
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js'
import type { GitObject, Oid, Signature, TreeEntry } from '../model/types.ts'

function concat(chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}

export function formatTz(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? '-' : '+'
  const abs = Math.abs(offsetMinutes)
  const hh = String(Math.floor(abs / 60)).padStart(2, '0')
  const mm = String(abs % 60).padStart(2, '0')
  return `${sign}${hh}${mm}`
}

export function formatSignature(sig: Signature): string {
  return `${sig.name} <${sig.email}> ${sig.timestamp} ${formatTz(sig.tzOffset)}`
}

/** tree の中での並び順。ディレクトリは名前の後ろに '/' があるものとして比べる */
export function compareTreeEntries(a: TreeEntry, b: TreeEntry): number {
  const ka = a.mode === '40000' ? `${a.name}/` : a.name
  const kb = b.mode === '40000' ? `${b.name}/` : b.name
  return ka < kb ? -1 : ka > kb ? 1 : 0
}

function body(obj: GitObject): Uint8Array {
  switch (obj.type) {
    case 'blob':
      return utf8ToBytes(obj.content)
    case 'tree':
      return concat(
        [...obj.entries]
          .sort(compareTreeEntries)
          .flatMap((e) => [utf8ToBytes(`${e.mode} ${e.name}\0`), hexToBytes(e.oid)]),
      )
    case 'commit': {
      const lines = [`tree ${obj.tree}`]
      for (const p of obj.parents) lines.push(`parent ${p}`)
      lines.push(`author ${formatSignature(obj.author)}`)
      lines.push(`committer ${formatSignature(obj.committer)}`)
      return utf8ToBytes(`${lines.join('\n')}\n\n${obj.message}`)
    }
  }
}

export function hashObject(obj: GitObject): Oid {
  const content = body(obj)
  const header = utf8ToBytes(`${obj.type} ${content.length}\0`)
  return bytesToHex(sha1(concat([header, content])))
}

/** 作業ツリーのファイル内容から、add したときの blob のハッシュを求める */
export function hashBlob(content: string): Oid {
  return hashObject({ type: 'blob', content })
}
