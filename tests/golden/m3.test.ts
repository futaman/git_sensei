// M3：clone / remote / fetch / pull / push とリモート追跡ブランチ。
// origin.git（サーバー役の bare リポジトリ）、npc（同僚）、me（プレイヤー）の3つを使う。
import { describe, it } from 'vitest'
import { expectSameAsRealGit, type Step } from './harness.ts'

const out = ['stdout'] as ('stdout' | 'stderr')[]
const ORIGIN = '{root}/origin.git'

/** 空のサーバー */
const emptyOrigin: Step[] = [{ in: 'origin.git', git: ['init', '--bare'] }]

/** 同僚（npc）が最初のコミットを origin に push したところ */
const seeded: Step[] = [
  ...emptyOrigin,
  { in: 'npc', git: ['init'] },
  { in: 'npc', write: ['README.md', '# team\n'] },
  { in: 'npc', write: ['src/app.js', 'console.log(1)\n'] },
  { in: 'npc', git: ['add', '.'] },
  { in: 'npc', git: ['commit', '-m', 'initial'] },
  { in: 'npc', git: ['remote', 'add', 'origin', ORIGIN] },
  { in: 'npc', git: ['push', '-u', 'origin', 'main'], compare: out },
]

/** 自分（me）もクローンしたところ */
const bothCloned: Step[] = [...seeded, { in: '.', git: ['clone', ORIGIN, 'me'] }]

describe('clone', () => {
  it('中身のあるリポジトリをクローンする', () => {
    expectSameAsRealGit([
      ...bothCloned,
      { git: ['status'], compare: out },
      { git: ['status', '-sb'], compare: out },
      { git: ['branch', '-a'], compare: out },
      { git: ['branch', '-r'], compare: out },
      { git: ['log', '--oneline', '--decorate'], compare: out },
      { git: ['remote', '-v'], compare: out },
    ])
  })

  it('空のリポジトリをクローンして、最初の push をする', () => {
    expectSameAsRealGit([
      ...emptyOrigin,
      { in: '.', git: ['clone', ORIGIN, 'me'] },
      { check: true },
      { git: ['status'], compare: out },
      { write: ['a.txt', 'a\n'] },
      { git: ['add', '.'] },
      { git: ['commit', '-m', 'first'] },
      { git: ['push'] },
      { git: ['push', '-u', 'origin', 'main'], compare: out },
      { git: ['status'], compare: out },
    ])
  })

  it('クローンできないとき', () => {
    expectSameAsRealGit([
      ...seeded,
      { in: '.', git: ['clone', '{root}/nope.git', 'x'] },
      { in: '.', git: ['clone', ORIGIN, 'npc'] },
      { in: '.', git: ['clone', ORIGIN] },
      { in: 'origin', git: ['status'] },
    ])
  })
})

describe('fetch と pull', () => {
  it('同僚の push を fetch して、pull で早送りする', () => {
    expectSameAsRealGit([
      ...bothCloned,
      { in: 'npc', write: ['README.md', '# team\nupdated by npc\n'] },
      { in: 'npc', git: ['commit', '-am', 'update readme'] },
      { in: 'npc', git: ['push'] },
      { git: ['status'], compare: out },
      { git: ['fetch'] },
      { git: ['status'], compare: out },
      { git: ['status', '-sb'], compare: out },
      { git: ['log', '--oneline', '--decorate', '--all'], compare: out },
      { git: ['pull'], compare: out },
      { git: ['pull'], compare: out },
      { git: ['log', '--oneline', '--decorate'], compare: out },
    ])
  })

  it('fetch せずにいきなり pull する', () => {
    expectSameAsRealGit([
      ...bothCloned,
      { in: 'npc', write: ['new.txt', 'n\n'] },
      { in: 'npc', git: ['add', '.'] },
      { in: 'npc', git: ['commit', '-m', 'add new'] },
      { in: 'npc', git: ['push'] },
      { git: ['pull'], compare: out },
      { git: ['status'], compare: out },
    ])
  })

  it('分岐していると pull は取り込み方を聞いてくる', () => {
    expectSameAsRealGit([
      ...bothCloned,
      { in: 'npc', write: ['npc.txt', 'n\n'] },
      { in: 'npc', git: ['add', '.'] },
      { in: 'npc', git: ['commit', '-m', 'npc work'] },
      { in: 'npc', git: ['push'] },
      { write: ['me.txt', 'm\n'] },
      { git: ['add', '.'] },
      { git: ['commit', '-m', 'my work'] },
      { git: ['pull'] },
      { check: true },
      { git: ['status', '-sb'], compare: out },
      { git: ['pull', '--ff-only'] },
      { check: true },
    ])
  })

  it('手元の変更が上書きされるなら pull しない', () => {
    expectSameAsRealGit([
      ...bothCloned,
      { in: 'npc', write: ['README.md', 'npc\n'] },
      { in: 'npc', git: ['commit', '-am', 'npc edit'] },
      { in: 'npc', git: ['push'] },
      { write: ['README.md', 'my local edit\n'] },
      { git: ['pull'] },
    ])
  })

  it('空のクローンに、あとから同僚が push したものを pull する', () => {
    expectSameAsRealGit([
      ...emptyOrigin,
      { in: '.', git: ['clone', ORIGIN, 'me'] },
      { in: 'npc', git: ['init'] },
      { in: 'npc', write: ['README.md', 'hi\n'] },
      { in: 'npc', git: ['add', '.'] },
      { in: 'npc', git: ['commit', '-m', 'initial'] },
      { in: 'npc', git: ['remote', 'add', 'origin', ORIGIN] },
      { in: 'npc', git: ['push', '-u', 'origin', 'main'] },
      { git: ['pull'] },
      { git: ['status'], compare: out },
    ])
  })

  it('fetch --prune で、消されたリモートブランチを片付ける', () => {
    expectSameAsRealGit([
      ...bothCloned,
      { in: 'npc', git: ['switch', '-c', 'feature'] },
      { in: 'npc', write: ['f.txt', 'f\n'] },
      { in: 'npc', git: ['add', '.'] },
      { in: 'npc', git: ['commit', '-m', 'feature'] },
      { in: 'npc', git: ['push', '-u', 'origin', 'feature'], compare: out },
      { git: ['fetch'] },
      { git: ['switch', 'feature'], compare: out },
      { git: ['branch', '-a'], compare: out },
      { in: 'npc', git: ['push', 'origin', '--delete', 'feature'] },
      { git: ['fetch', '--prune'] },
      { git: ['branch', '-a'], compare: out },
      { git: ['status'], compare: out },
      { git: ['status', '-sb'], compare: out },
    ])
  })
})

describe('push', () => {
  it('先に push されていると拒否される（fetch first）', () => {
    expectSameAsRealGit([
      ...bothCloned,
      { in: 'npc', write: ['npc.txt', 'n\n'] },
      { in: 'npc', git: ['add', '.'] },
      { in: 'npc', git: ['commit', '-m', 'npc work'] },
      { in: 'npc', git: ['push'] },
      { write: ['me.txt', 'm\n'] },
      { git: ['add', '.'] },
      { git: ['commit', '-m', 'my work'] },
      { git: ['push'] },
      { check: true },
      { git: ['fetch'] },
      { git: ['push'] },
    ])
  })

  it('force push は同僚のコミットを消す', () => {
    expectSameAsRealGit([
      ...bothCloned,
      { in: 'npc', write: ['npc.txt', 'n\n'] },
      { in: 'npc', git: ['add', '.'] },
      { in: 'npc', git: ['commit', '-m', 'npc work'] },
      { in: 'npc', git: ['push'] },
      { write: ['me.txt', 'm\n'] },
      { git: ['add', '.'] },
      { git: ['commit', '-m', 'my work'] },
      { git: ['push', '--force'] },
      { check: true },
      { in: 'npc', git: ['fetch'] },
      { in: 'npc', git: ['status', '-sb'], compare: out },
    ])
  })

  it('--force-with-lease は、知らない更新があれば拒否する', () => {
    expectSameAsRealGit([
      ...bothCloned,
      { write: ['me.txt', 'm\n'] },
      { git: ['add', '.'] },
      { git: ['commit', '-m', 'my work'] },
      { in: 'npc', write: ['npc.txt', 'n\n'] },
      { in: 'npc', git: ['add', '.'] },
      { in: 'npc', git: ['commit', '-m', 'npc work'] },
      { in: 'npc', git: ['push'] },
      { git: ['push', '--force-with-lease'] },
      { check: true },
      { git: ['fetch'] },
      { git: ['push', '--force-with-lease'] },
    ])
  })

  it('上流がないと push できず、-u で設定できる', () => {
    expectSameAsRealGit([
      ...bothCloned,
      { git: ['switch', '-c', 'topic'] },
      { write: ['t.txt', 't\n'] },
      { git: ['add', '.'] },
      { git: ['commit', '-m', 'topic'] },
      { git: ['push'] },
      { git: ['push', '-u', 'origin', 'topic'], compare: out },
      { git: ['push'] },
      { git: ['status'], compare: out },
      { git: ['push', 'origin', 'nope'] },
    ])
  })

  it('リモートの指定がおかしいとき', () => {
    expectSameAsRealGit([
      { git: ['init'] },
      { write: ['a.txt', 'a\n'] },
      { git: ['add', '.'] },
      { git: ['commit', '-m', 'a'] },
      { git: ['push'] },
      { git: ['push', 'origin', 'main'] },
      { git: ['fetch', 'origin'] },
      { git: ['pull'] },
    ])
  })
})

describe('remote / 上流の設定', () => {
  it('remote add / -v / remove', () => {
    expectSameAsRealGit([
      ...seeded,
      { git: ['init'] },
      { git: ['remote', 'add', 'origin', ORIGIN] },
      { git: ['remote'], compare: out },
      { git: ['remote', '-v'], compare: out },
      { git: ['remote', 'add', 'origin', ORIGIN] },
      { git: ['fetch'] },
      { git: ['branch', '-r'], compare: out },
      { git: ['switch', 'main'], compare: out },
      { check: true },
      { git: ['remote', 'add', 'upstream', '{root}/npc'] },
      { git: ['remote', 'remove', 'origin'] },
      { git: ['remote', '-v'], compare: out },
      { git: ['remote', 'remove', 'nope'] },
    ])
  })

  it('branch -u / --unset-upstream / リモート追跡ブランチから作る', () => {
    expectSameAsRealGit([
      ...bothCloned,
      { git: ['branch', 'work'] },
      { git: ['branch', '-u', 'origin/main', 'work'], compare: out },
      { git: ['branch', '--unset-upstream', 'work'] },
      { git: ['branch', '--unset-upstream', 'work'] },
      { git: ['switch', '-c', 'topic', 'origin/main'], compare: out },
      { git: ['branch', 'other', 'origin/main'], compare: out },
      { git: ['branch', '-u', 'origin/nope'] },
      { git: ['config', 'branch.main.remote'], compare: out },
      { git: ['config', '--get', 'remote.origin.fetch'], compare: out },
    ])
  })

  it('ブランチ名を変えると上流の設定もついていく', () => {
    expectSameAsRealGit([
      ...bothCloned,
      { git: ['branch', '-m', 'main', 'trunk'] },
      { git: ['status', '-sb'], compare: out },
    ])
  })
})
