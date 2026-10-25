import { describe, expect, it } from 'vitest'
import { hashBlob, hashObject } from './serialize.ts'

// 期待値は本物のgitで求めたもの（git hash-object / git mktree / git commit-tree）
describe('hashObject', () => {
  it('blob', () => {
    expect(hashBlob('hello\n')).toBe('ce013625030ba8dba906f756967f9e9ca394464a')
    expect(hashBlob('')).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391')
  })

  it('空の tree', () => {
    expect(hashObject({ type: 'tree', entries: [] })).toBe(
      '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
    )
  })

  it('tree はエントリの順序によらず同じハッシュになる', () => {
    const a = { mode: '100644' as const, name: 'a.txt', oid: hashBlob('a\n') }
    const b = { mode: '100644' as const, name: 'b.txt', oid: hashBlob('b\n') }
    expect(hashObject({ type: 'tree', entries: [a, b] })).toBe(
      hashObject({ type: 'tree', entries: [b, a] }),
    )
  })
})
