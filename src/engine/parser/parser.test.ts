import { describe, expect, it } from 'vitest'
import { parseArgs } from './options.ts'
import { tokenize } from './tokenize.ts'

describe('tokenize', () => {
  it('空白で区切る', () => {
    expect(tokenize('git  add   a.txt')).toEqual({ ok: true, argv: ['git', 'add', 'a.txt'] })
  })

  it('クォートの中の空白と日本語を保つ', () => {
    expect(tokenize(`git commit -m "最初の コミット" -m 'it''s'`)).toEqual({
      ok: true,
      argv: ['git', 'commit', '-m', '最初の コミット', '-m', 'its'],
    })
  })

  it('エスケープ', () => {
    expect(tokenize(String.raw`echo "a\"b" c\ d`)).toEqual({
      ok: true,
      argv: ['echo', 'a"b', 'c d'],
    })
  })

  it('空のクォートも1つの引数になる', () => {
    expect(tokenize(`git commit -m ""`)).toEqual({ ok: true, argv: ['git', 'commit', '-m', ''] })
  })

  it('閉じていないクォートはエラー', () => {
    expect(tokenize(`git commit -m "abc`).ok).toBe(false)
  })
})

describe('parseArgs', () => {
  const specs = [
    { name: 'all', short: 'a', long: ['all'] },
    { name: 'message', short: 'm', long: ['message'], value: true, multiple: true },
    { name: 'amend', long: ['amend'] },
  ]

  it('短いフラグの連結と値（-am msg）', () => {
    const r = parseArgs(['-am', 'msg'], specs)
    expect(r.ok && [...r.args.flags]).toEqual(['all'])
    expect(r.ok && r.args.values.get('message')).toEqual(['msg'])
  })

  it('値の書き方いろいろ', () => {
    const r = parseArgs(['-mone', '--message=two', '--message', 'three'], specs)
    expect(r.ok && r.args.values.get('message')).toEqual(['one', 'two', 'three'])
  })

  it('-- の後ろはすべて位置引数', () => {
    const r = parseArgs(['--amend', '--', '-a'], specs)
    expect(r.ok && r.args.positionals).toEqual(['-a'])
  })

  it('知らないオプションはエラー', () => {
    expect(parseArgs(['--force'], specs).ok).toBe(false)
  })

  it('数字だけの短いオプション（log -3）', () => {
    const r = parseArgs(['-3'], [], { numericShorthand: 'max-count' })
    expect(r.ok && r.args.values.get('max-count')).toEqual(['3'])
  })
})
