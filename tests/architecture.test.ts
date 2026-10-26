// 層の境界のうち、Biome では検査できないものをここで確かめる（docs/05 §2.1）。
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(import.meta.dirname, '..')

function sourceFiles(dir: string): string[] {
  return readdirSync(join(root, dir), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.tsx?$/.test(e.name) && !e.name.endsWith('.test.ts'))
    .map((e) => relative(root, join(e.parentPath, e.name)))
}

// 説明のコメントに「Date.now() は使わない」と書けるよう、コメントを除いてから検査する
function readCode(file: string): string {
  return readFileSync(join(root, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

const nonDeterministic = [
  { pattern: /\bDate\.now\s*\(/, label: 'Date.now()' },
  { pattern: /\bnew Date\s*\(\s*\)/, label: 'new Date()' },
  { pattern: /\bMath\.random\s*\(/, label: 'Math.random()' },
  { pattern: /\bperformance\.now\s*\(/, label: 'performance.now()' },
]

describe.each(['src/engine', 'src/drama'])('%s は決定的', (dir) => {
  it.each(sourceFiles(dir))('%s は現在時刻や乱数を直接使わない', (file) => {
    const code = readCode(file)
    const found = nonDeterministic.filter(({ pattern }) => pattern.test(code)).map((n) => n.label)
    expect(found, '時刻と乱数は ctx から受け取る').toEqual([])
  })
})

describe('src/drama は engine の型だけに依存する', () => {
  it.each(sourceFiles('src/drama'))('%s', (file) => {
    const code = readCode(file)
    const valueImports = code.match(
      /^import\s+(?!type\b)[^;]*?from\s+['"][^'"]*\bengine\b[^'"]*['"]/gm,
    )
    expect(valueImports ?? [], 'engine からは import type を使う').toEqual([])
  })
})

// `key in obj` は Object.prototype の名前（'toString' など）も「ある」と答える。
// 利用者が決める名前を調べるときは has / own（Object.hasOwn）を使う。
// 判別共用体の `'branch' in dest` のように、左が文字列リテラルのものだけは許す。
describe.each(['src/engine', 'src/ui'])('%s は in 演算子で存在を調べない', (dir) => {
  it.each(sourceFiles(dir))('%s', (file) => {
    const code = readCode(file)
      .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
      .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
      .replace(/`(?:[^`\\]|\\.)*`/g, '``')
    const found = [...code.matchAll(/(\S+)\s+in\s+[\w$(]/g)]
      .filter((m) => !/(''|"")$/.test(m[1] as string))
      .map((m) => m[0])
    expect(found, 'Object.hasOwn（engine の has / own）を使う').toEqual([])
  })
})
