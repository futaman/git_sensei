// 画面向けの問い合わせのうち、本物のgitと比べられないもの。
import { describe, expect, it } from 'vitest'
import { createWorld, own, pathConflict } from './index.ts'

describe('pathConflict', () => {
  const world = createWorld({
    '/home/you': {
      path: '/home/you',
      files: { d: 'file\n', 'src/a.ts': 'a\n', 'src/lib/b.ts': 'b\n' },
    },
    '/home/you/team': { path: '/home/you/team' },
  })
  const ws = own(world.workspaces, '/home/you')
  if (!ws) throw new Error('workspace missing')

  it('途中のディレクトリと同じ名前のファイルがあればぶつかる', () => {
    expect(pathConflict(world, ws, 'd/x')).toEqual({ kind: 'parentIsFile', path: 'd' })
    expect(pathConflict(world, ws, 'd/e/f')).toEqual({ kind: 'parentIsFile', path: 'd' })
  })

  it('同じ名前のディレクトリがあればぶつかる', () => {
    expect(pathConflict(world, ws, 'src')).toEqual({ kind: 'isDirectory' })
    expect(pathConflict(world, ws, 'src/lib')).toEqual({ kind: 'isDirectory' })
  })

  it('clone でできたフォルダ（別のワークスペース）とぶつかる', () => {
    expect(pathConflict(world, ws, 'team')).toEqual({ kind: 'isDirectory' })
    expect(pathConflict(world, ws, 'team/x')).toEqual({ kind: 'insideWorkspace', name: 'team' })
  })

  it('ぶつからない名前', () => {
    expect(pathConflict(world, ws, 'src/c.ts')).toBeNull()
    expect(pathConflict(world, ws, 'srcx')).toBeNull()
    expect(pathConflict(world, ws, 'dd/x')).toBeNull()
    expect(pathConflict(world, ws, 'toString/x')).toBeNull()
    expect(pathConflict(world, ws, 'teamx')).toBeNull()
  })
})
